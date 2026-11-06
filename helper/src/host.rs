//! Native messaging host mode: origin check, request loop, handshake gate, and
//! a single writer thread that owns standard output.

use std::io::{self, Read, Write};
use std::process::ExitCode;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use serde_json::{Map, Value, json};

use crate::framing::{ReadError, read_frame, write_frame};
use crate::identity::{ALLOWED_ORIGIN, EXTENSION_ID, PROTOCOL_VERSION};
use crate::protocol::{ErrorCode, Outgoing, ProtocolError, Request, encode, parse_request};

/// Per-connection state. One session lives as long as the browser port.
#[derive(Debug, Default)]
pub struct Session {
    greeted: bool,
}

impl Session {
    /// Turn one inbound frame into exactly one outbound message.
    pub fn handle_frame(&mut self, frame: &[u8]) -> Outgoing {
        let request = match parse_request(frame) {
            Ok(request) => request,
            Err((id, error)) => return Outgoing::Error { id, error },
        };
        let id = request.id;
        match self.dispatch(request) {
            Ok(result) => Outgoing::Response { id, result },
            Err(error) => Outgoing::Error {
                id: Some(id),
                error,
            },
        }
    }

    /// Route a validated request to its method handler.
    fn dispatch(&mut self, request: Request) -> Result<Value, ProtocolError> {
        if request.method == "hello" {
            let result = hello(&request.params)?;
            self.greeted = true;
            return Ok(result);
        }
        if !self.greeted {
            return Err(ProtocolError::new(
                ErrorCode::BadRequest,
                "Send hello before any other request.",
            ));
        }
        Err(ProtocolError::new(
            ErrorCode::UnknownMethod,
            format!("Unknown method \"{}\".", request.method),
        ))
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

/// Read frames until the browser closes the port, handing each reply to the writer.
pub fn read_loop<R: Read>(input: &mut R, sender: &Sender<Outgoing>) -> Result<(), String> {
    let mut session = Session::default();
    loop {
        match read_frame(input) {
            Ok(frame) => {
                if sender.send(session.handle_frame(&frame)).is_err() {
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
    let read_result = read_loop(&mut io::stdin().lock(), &sender);
    drop(sender);
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
    use std::io::Cursor;

    /// Frame a JSON value the way the browser does.
    fn framed(value: Value) -> Vec<u8> {
        let payload = value.to_string().into_bytes();
        let mut bytes = (payload.len() as u32).to_le_bytes().to_vec();
        bytes.extend(payload);
        bytes
    }

    /// Run the read and write loops over in-memory streams and decode the replies.
    fn exchange(requests: &[Value]) -> Vec<Value> {
        let input: Vec<u8> = requests.iter().cloned().flat_map(framed).collect();
        let (sender, receiver) = mpsc::channel();
        read_loop(&mut Cursor::new(input), &sender).unwrap();
        drop(sender);
        let mut output = Vec::new();
        write_loop(receiver, &mut output).unwrap();

        let mut cursor = Cursor::new(output);
        let mut replies = Vec::new();
        while let Ok(frame) = read_frame(&mut cursor) {
            replies.push(serde_json::from_slice(&frame).unwrap());
        }
        replies
    }

    #[test]
    fn hello_returns_helper_description() {
        let replies = exchange(&[json!({ "id": 1, "method": "hello", "params": { "protocol": 1 } })]);
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
        let replies = exchange(&[json!({ "id": 3, "method": "hello", "params": { "protocol": 2 } })]);
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
        let replies = exchange(&[json!({ "id": 1, "method": "listPages" })]);
        assert_eq!(replies[0]["error"]["code"], json!("BAD_REQUEST"));
    }

    #[test]
    fn unknown_methods_after_hello_are_reported() {
        let replies = exchange(&[
            json!({ "id": 1, "method": "hello", "params": { "protocol": 1 } }),
            json!({ "id": 2, "method": "doesNotExist" }),
        ]);
        assert_eq!(replies[1]["id"], json!(2));
        assert_eq!(replies[1]["error"]["code"], json!("UNKNOWN_METHOD"));
    }

    #[test]
    fn malformed_frames_get_an_error_and_the_loop_continues() {
        let mut input = 5u32.to_le_bytes().to_vec();
        input.extend_from_slice(b"{bad}");
        input.extend(framed(
            json!({ "id": 2, "method": "hello", "params": { "protocol": 1 } }),
        ));
        let (sender, receiver) = mpsc::channel();
        read_loop(&mut Cursor::new(input), &sender).unwrap();
        drop(sender);
        let replies: Vec<Value> = receiver.iter().map(|message| message.to_value()).collect();
        assert_eq!(replies[0]["id"], Value::Null);
        assert_eq!(replies[0]["error"]["code"], json!("BAD_REQUEST"));
        assert_eq!(replies[1]["id"], json!(2));
        assert!(replies[1]["result"].is_object());
    }

    #[test]
    fn truncated_input_ends_the_loop_with_an_error() {
        let (sender, _receiver) = mpsc::channel();
        let result = read_loop(&mut Cursor::new(vec![9u8, 0, 0, 0, b'{']), &sender);
        assert!(result.is_err());
    }

    #[test]
    fn only_the_quire_origin_is_accepted() {
        assert!(check_origin(ALLOWED_ORIGIN).is_ok());
        assert!(check_origin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/").is_err());
        assert!(check_origin("chrome-extension://hbddhigdogedopjjlihlkpehidopddac").is_err());
        assert!(check_origin("").is_err());
    }
}
