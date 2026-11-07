//! Native messaging host mode: origin check, request loop, handshake gate,
//! method dispatch, and a single writer thread that owns standard output.

use std::io::{self, Read, Write};
use std::process::ExitCode;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use serde_json::{Map, Value, json};

use crate::config;
use crate::dirs;
use crate::framing::{ReadError, read_frame, write_frame};
use crate::git;
use crate::identity::{ALLOWED_ORIGIN, EXTENSION_ID, PROTOCOL_VERSION};
use crate::install::TargetOs;
use crate::protocol::{ErrorCode, Outgoing, ProtocolError, Request, encode, parse_request};
use crate::workspace::{Workspace, status_for};

/// Outcome of dispatching one request.
enum Dispatch {
    /// The reply is ready now.
    Reply(Result<Value, ProtocolError>),
    /// A background thread will send the reply.
    Deferred,
}

/// Per-connection state. One session lives as long as the browser port.
pub struct Session {
    greeted: bool,
    workspace: Workspace,
    out: Sender<Outgoing>,
}

impl Session {
    /// Create a session that sends every reply through `out`.
    pub fn new(workspace: Workspace, out: Sender<Outgoing>) -> Self {
        Self {
            greeted: false,
            workspace,
            out,
        }
    }

    /// Handle one inbound frame. Every request gets exactly one reply, now or later.
    /// Returns false when the writer is gone.
    pub fn handle_frame(&mut self, frame: &[u8]) -> bool {
        let request = match parse_request(frame) {
            Ok(request) => request,
            Err((id, error)) => return self.out.send(Outgoing::Error { id, error }).is_ok(),
        };
        let id = request.id;
        match self.dispatch(request) {
            Dispatch::Reply(result) => self.out.send(reply(id, result)).is_ok(),
            Dispatch::Deferred => true,
        }
    }

    /// Route a validated request to its method handler.
    fn dispatch(&mut self, request: Request) -> Dispatch {
        let params = &request.params;
        if request.method == "hello" {
            let result = hello(params);
            self.greeted |= result.is_ok();
            return Dispatch::Reply(result);
        }
        if !self.greeted {
            return Dispatch::Reply(Err(ProtocolError::new(
                ErrorCode::BadRequest,
                "Send hello before any other request.",
            )));
        }
        let result = match request.method.as_str() {
            "getWorkspace" => Ok(self.workspace.status()),
            "listDirs" => optional_string(params, "path").and_then(|path| {
                let start = path
                    .or_else(|| dirs::home_dir().map(|home| home.to_string_lossy().into_owned()))
                    .ok_or_else(|| {
                        ProtocolError::new(ErrorCode::NotFound, "Your home folder is unknown.")
                    })?;
                dirs::list_dirs(&start)
            }),
            "createDir" => string(params, "parent")
                .and_then(|parent| dirs::create_dir(&parent, &string(params, "name")?)),
            "setRoot" => string(params, "path").and_then(|path| self.workspace.set_root(&path)),
            "gitInit" => self.with_root(git::init),
            "gitSetIdentity" => string(params, "name").and_then(|name| {
                let email = string(params, "email")?;
                self.with_root(|root| git::set_identity(root, &name, &email))
            }),
            "gitSetOrigin" => string(params, "url")
                .and_then(|url| self.with_root(|root| git::set_origin(root, &url))),
            "gitPublish" => match self.workspace.root() {
                Ok(root) => {
                    let out = self.out.clone();
                    let id = request.id;
                    thread::spawn(move || {
                        let result = git::publish(&root).map(|()| status_for(Some(&root)));
                        let _ = out.send(reply(id, result));
                    });
                    return Dispatch::Deferred;
                }
                Err(error) => Err(error),
            },
            other => Err(ProtocolError::new(
                ErrorCode::UnknownMethod,
                format!("Unknown method \"{other}\"."),
            )),
        };
        Dispatch::Reply(result)
    }

    /// Run a step against the notes folder and answer with the new workspace state.
    fn with_root(
        &self,
        step: impl FnOnce(&std::path::Path) -> Result<(), ProtocolError>,
    ) -> Result<Value, ProtocolError> {
        let root = self.workspace.root()?;
        step(&root)?;
        Ok(self.workspace.status())
    }
}

/// Wrap a handler result as a response or an error for the given request.
fn reply(id: u64, result: Result<Value, ProtocolError>) -> Outgoing {
    match result {
        Ok(result) => Outgoing::Response { id, result },
        Err(error) => Outgoing::Error {
            id: Some(id),
            error,
        },
    }
}

/// Read a required string parameter.
fn string(params: &Map<String, Value>, name: &str) -> Result<String, ProtocolError> {
    optional_string(params, name)?.ok_or_else(|| {
        ProtocolError::new(ErrorCode::BadRequest, format!("params.{name} is required."))
    })
}

/// Read an optional string parameter; a value of another type is an error.
fn optional_string(
    params: &Map<String, Value>,
    name: &str,
) -> Result<Option<String>, ProtocolError> {
    match params.get(name) {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value.clone())),
        Some(_) => Err(ProtocolError::new(
            ErrorCode::BadRequest,
            format!("params.{name} must be a string."),
        )),
    }
}

/// Handshake: confirm the protocol version and describe this helper.
fn hello(params: &Map<String, Value>) -> Result<Value, ProtocolError> {
    let requested = params
        .get("protocol")
        .and_then(Value::as_u64)
        .ok_or_else(|| {
            ProtocolError::new(
                ErrorCode::BadRequest,
                "hello needs params.protocol as a positive integer.",
            )
        })?;
    if requested != PROTOCOL_VERSION {
        return Err(ProtocolError::new(
            ErrorCode::ProtocolMismatch,
            format!(
                "Quire Helper {} speaks protocol {PROTOCOL_VERSION}, but this version of Quire needs protocol {requested}.",
                env!("CARGO_PKG_VERSION")
            ),
        ));
    }
    Ok(json!({
        "helperVersion": env!("CARGO_PKG_VERSION"),
        "protocol": PROTOCOL_VERSION,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
    }))
}

/// Read frames until the browser closes the port, handing each to the session.
pub fn read_loop<R: Read>(input: &mut R, session: &mut Session) -> Result<(), String> {
    loop {
        match read_frame(input) {
            Ok(frame) => {
                if !session.handle_frame(&frame) {
                    return Err("output closed".to_string());
                }
            }
            Err(ReadError::Eof) => return Ok(()),
            Err(error) => return Err(error.to_string()),
        }
    }
}

/// Serialize and frame every queued message until all senders are dropped.
pub fn write_loop<W: Write>(receiver: Receiver<Outgoing>, output: &mut W) -> Result<(), String> {
    for message in receiver {
        write_frame(output, &encode(&message)).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Accept only the fixed Quire extension origin.
pub fn check_origin(origin: &str) -> Result<(), String> {
    if origin == ALLOWED_ORIGIN {
        Ok(())
    } else {
        Err(format!(
            "refusing connection from {origin}; only extension {EXTENSION_ID} may connect."
        ))
    }
}

/// Run host mode for the given caller origin and return the process exit code.
pub fn run(origin: &str) -> ExitCode {
    if let Err(error) = check_origin(origin) {
        eprintln!("quire-helper: {error}");
        return ExitCode::from(2);
    }

    let (sender, receiver) = mpsc::channel::<Outgoing>();
    let writer = thread::spawn(move || write_loop(receiver, &mut io::stdout().lock()));
    let settings = config::config_file(TargetOs::current(), crate::process_var);
    let mut session = Session::new(Workspace::load(settings), sender);
    let read_result = read_loop(&mut io::stdin().lock(), &mut session);
    drop(session);
    let write_result = writer
        .join()
        .unwrap_or_else(|_| Err("writer thread panicked".to_string()));

    match (read_result, write_result) {
        (Ok(()), Ok(())) => ExitCode::SUCCESS,
        (Err(error), _) | (_, Err(error)) => {
            eprintln!("quire-helper: {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;
    use std::io::Cursor;

    /// Frame a JSON value the way the browser does.
    fn framed(value: Value) -> Vec<u8> {
        let payload = value.to_string().into_bytes();
        let mut bytes = (payload.len() as u32).to_le_bytes().to_vec();
        bytes.extend(payload);
        bytes
    }

    /// The hello request every session starts with.
    fn hello_request(id: u64) -> Value {
        json!({ "id": id, "method": "hello", "params": { "protocol": 1 } })
    }

    /// Run a session over in-memory streams and decode the replies in id order.
    fn exchange_with(workspace: Workspace, requests: &[Value]) -> Vec<Value> {
        let input: Vec<u8> = requests.iter().cloned().flat_map(framed).collect();
        let (sender, receiver) = mpsc::channel();
        let mut session = Session::new(workspace, sender);
        read_loop(&mut Cursor::new(input), &mut session).unwrap();
        drop(session);
        let mut output = Vec::new();
        write_loop(receiver, &mut output).unwrap();

        let mut cursor = Cursor::new(output);
        let mut replies: Vec<Value> = Vec::new();
        while let Ok(frame) = read_frame(&mut cursor) {
            replies.push(serde_json::from_slice(&frame).unwrap());
        }
        replies.sort_by_key(|reply| reply["id"].as_u64().unwrap_or(0));
        replies
    }

    /// Run a session with no remembered notes folder.
    fn exchange(requests: &[Value]) -> Vec<Value> {
        exchange_with(Workspace::load(None), requests)
    }

    #[test]
    fn hello_returns_helper_description() {
        let replies = exchange(&[hello_request(1)]);
        assert_eq!(replies.len(), 1);
        let result = &replies[0]["result"];
        assert_eq!(replies[0]["id"], json!(1));
        assert_eq!(result["helperVersion"], json!(env!("CARGO_PKG_VERSION")));
        assert_eq!(result["protocol"], json!(PROTOCOL_VERSION));
        assert_eq!(result["os"], json!(std::env::consts::OS));
        assert_eq!(result["arch"], json!(std::env::consts::ARCH));
    }

    #[test]
    fn hello_with_another_protocol_is_a_mismatch() {
        let replies =
            exchange(&[json!({ "id": 3, "method": "hello", "params": { "protocol": 2 } })]);
        assert_eq!(replies[0]["id"], json!(3));
        assert_eq!(replies[0]["error"]["code"], json!("PROTOCOL_MISMATCH"));
    }

    #[test]
    fn hello_without_protocol_is_a_bad_request() {
        let replies = exchange(&[json!({ "id": 3, "method": "hello" })]);
        assert_eq!(replies[0]["error"]["code"], json!("BAD_REQUEST"));
    }

    #[test]
    fn requests_before_hello_are_rejected() {
        let replies = exchange(&[json!({ "id": 1, "method": "getWorkspace" })]);
        assert_eq!(replies[0]["error"]["code"], json!("BAD_REQUEST"));
    }

    #[test]
    fn unknown_methods_after_hello_are_reported() {
        let replies = exchange(&[
            hello_request(1),
            json!({ "id": 2, "method": "doesNotExist" }),
        ]);
        assert_eq!(replies[1]["id"], json!(2));
        assert_eq!(replies[1]["error"]["code"], json!("UNKNOWN_METHOD"));
    }

    #[test]
    fn malformed_frames_get_an_error_and_the_loop_continues() {
        let mut input = 5u32.to_le_bytes().to_vec();
        input.extend_from_slice(b"{bad}");
        input.extend(framed(hello_request(2)));
        let (sender, receiver) = mpsc::channel();
        let mut session = Session::new(Workspace::load(None), sender);
        read_loop(&mut Cursor::new(input), &mut session).unwrap();
        drop(session);
        let replies: Vec<Value> = receiver.iter().map(|message| message.to_value()).collect();
        assert_eq!(replies[0]["id"], Value::Null);
        assert_eq!(replies[0]["error"]["code"], json!("BAD_REQUEST"));
        assert_eq!(replies[1]["id"], json!(2));
        assert!(replies[1]["result"].is_object());
    }

    #[test]
    fn truncated_input_ends_the_loop_with_an_error() {
        let (sender, _receiver) = mpsc::channel();
        let mut session = Session::new(Workspace::load(None), sender);
        let result = read_loop(&mut Cursor::new(vec![9u8, 0, 0, 0, b'{']), &mut session);
        assert!(result.is_err());
    }

    #[test]
    fn only_the_quire_origin_is_accepted() {
        assert!(check_origin(ALLOWED_ORIGIN).is_ok());
        assert!(check_origin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/").is_err());
        assert!(check_origin("chrome-extension://hbddhigdogedopjjlihlkpehidopddac").is_err());
        assert!(check_origin("").is_err());
    }

    #[test]
    fn setup_methods_choose_a_folder_and_initialize_git() {
        let dir = TestDir::new("host-setup");
        let parent = dir.path().to_string_lossy().into_owned();
        let settings = dir.path().join("settings").join("config.json");
        let replies = exchange_with(
            Workspace::load(Some(settings.clone())),
            &[
                hello_request(1),
                json!({ "id": 2, "method": "getWorkspace" }),
                json!({ "id": 3, "method": "createDir", "params": { "parent": parent, "name": "notes" } }),
                json!({ "id": 4, "method": "listDirs", "params": { "path": parent } }),
                json!({ "id": 5, "method": "gitInit" }),
                json!({ "id": 6, "method": "setRoot", "params": { "path": dir.path().join("notes").to_string_lossy() } }),
                json!({ "id": 7, "method": "gitInit" }),
                json!({ "id": 8, "method": "setRoot" }),
            ],
        );
        assert_eq!(replies[1]["result"]["root"], Value::Null);
        assert!(replies[2]["result"]["path"].is_string());
        let names: Vec<&str> = replies[3]["result"]["entries"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry["name"].as_str().unwrap())
            .collect();
        assert!(names.contains(&"notes"));
        assert_eq!(replies[4]["error"]["code"], json!("NOT_FOUND"));
        assert_eq!(replies[5]["result"]["rootName"], json!("notes"));
        assert_eq!(replies[6]["result"]["git"]["isRepo"], json!(true));
        assert_eq!(replies[7]["error"]["code"], json!("BAD_REQUEST"));
        assert!(config::read_root(&settings).is_some());
    }

    #[test]
    fn publish_replies_from_a_background_thread() {
        let dir = TestDir::new("host-publish");
        let notes = dir.path().join("notes");
        std::fs::create_dir(&notes).unwrap();
        let mut workspace = Workspace::load(None);
        workspace.set_root(&notes.to_string_lossy()).unwrap();
        let replies = exchange_with(
            workspace,
            &[
                hello_request(1),
                json!({ "id": 2, "method": "gitInit" }),
                json!({ "id": 3, "method": "gitPublish" }),
            ],
        );
        assert_eq!(replies.len(), 3);
        assert_eq!(replies[2]["id"], json!(3));
        assert_eq!(replies[2]["error"]["code"], json!("GIT"));
    }
}
