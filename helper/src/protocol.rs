//! Request and response envelopes of the Quire native messaging protocol
//! (see architecture.md, Native messaging protocol).

use serde_json::{Map, Value, json};

use crate::framing::MAX_OUTBOUND;

/// Error codes the helper can return. New codes are added to architecture.md first.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    BadRequest,
    UnknownMethod,
    ProtocolMismatch,
    TooLarge,
}

impl ErrorCode {
    /// Wire name of the code.
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::BadRequest => "BAD_REQUEST",
            ErrorCode::UnknownMethod => "UNKNOWN_METHOD",
            ErrorCode::ProtocolMismatch => "PROTOCOL_MISMATCH",
            ErrorCode::TooLarge => "TOO_LARGE",
        }
    }
}

/// A protocol-level failure returned to the extension.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProtocolError {
    pub code: ErrorCode,
    pub message: String,
}

impl ProtocolError {
    /// Create an error with a human-readable message.
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

/// A validated request from the extension.
#[derive(Debug, Clone, PartialEq)]
pub struct Request {
    pub id: u64,
    pub method: String,
    pub params: Map<String, Value>,
}

/// A message the helper sends to the extension.
#[derive(Debug, Clone, PartialEq)]
pub enum Outgoing {
    Response {
        id: u64,
        result: Value,
    },
    Error {
        id: Option<u64>,
        error: ProtocolError,
    },
}

impl Outgoing {
    /// Convert the message to its JSON wire form.
    pub fn to_value(&self) -> Value {
        match self {
            Outgoing::Response { id, result } => json!({ "id": id, "result": result }),
            Outgoing::Error { id, error } => json!({
                "id": id,
                "error": { "code": error.code.as_str(), "message": error.message },
            }),
        }
    }
}

/// Parse and validate one request frame. On failure, return the request id
/// when it could be read, so the error can be matched by the extension.
pub fn parse_request(frame: &[u8]) -> Result<Request, (Option<u64>, ProtocolError)> {
    let value: Value = serde_json::from_slice(frame).map_err(|error| {
        (
            None,
            ProtocolError::new(
                ErrorCode::BadRequest,
                format!("Message is not valid JSON: {error}"),
            ),
        )
    })?;

    let Value::Object(mut object) = value else {
        return Err((
            None,
            ProtocolError::new(ErrorCode::BadRequest, "Message must be a JSON object."),
        ));
    };

    let id = match object.get("id").and_then(Value::as_u64) {
        Some(id) if id > 0 => id,
        _ => {
            return Err((
                None,
                ProtocolError::new(
                    ErrorCode::BadRequest,
                    "Message needs a positive integer id.",
                ),
            ));
        }
    };

    let method = match object.remove("method") {
        Some(Value::String(method)) if !method.is_empty() => method,
        _ => {
            return Err((
                Some(id),
                ProtocolError::new(ErrorCode::BadRequest, "Request needs a method name."),
            ));
        }
    };

    let params = match object.remove("params") {
        None | Some(Value::Null) => Map::new(),
        Some(Value::Object(params)) => params,
        Some(_) => {
            return Err((
                Some(id),
                ProtocolError::new(ErrorCode::BadRequest, "params must be a JSON object."),
            ));
        }
    };

    Ok(Request { id, method, params })
}

/// Serialize a message for the wire. A response that exceeds the browser
/// limit is replaced by a `TOO_LARGE` error for the same request.
pub fn encode(message: &Outgoing) -> Vec<u8> {
    let bytes = message.to_value().to_string().into_bytes();
    if bytes.len() <= MAX_OUTBOUND {
        return bytes;
    }
    let id = match message {
        Outgoing::Response { id, .. } => Some(*id),
        Outgoing::Error { id, .. } => *id,
    };
    Outgoing::Error {
        id,
        error: ProtocolError::new(
            ErrorCode::TooLarge,
            format!(
                "The reply is {} bytes, over the {MAX_OUTBOUND}-byte browser limit.",
                bytes.len()
            ),
        ),
    }
    .to_value()
    .to_string()
    .into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_request_with_params() {
        let request =
            parse_request(br#"{"id":7,"method":"hello","params":{"protocol":1}}"#).unwrap();
        assert_eq!(request.id, 7);
        assert_eq!(request.method, "hello");
        assert_eq!(request.params.get("protocol"), Some(&json!(1)));
    }

    #[test]
    fn missing_params_become_an_empty_object() {
        let request = parse_request(br#"{"id":1,"method":"hello"}"#).unwrap();
        assert!(request.params.is_empty());
    }

    #[test]
    fn invalid_json_has_no_id() {
        let (id, error) = parse_request(b"{oops").unwrap_err();
        assert_eq!(id, None);
        assert_eq!(error.code, ErrorCode::BadRequest);
    }

    #[test]
    fn rejects_non_positive_or_missing_ids() {
        for frame in [
            &br#"{"method":"hello"}"#[..],
            br#"{"id":0,"method":"hello"}"#,
            br#"{"id":-3,"method":"hello"}"#,
            br#"{"id":"1","method":"hello"}"#,
            b"[1,2]",
        ] {
            let (id, error) = parse_request(frame).unwrap_err();
            assert_eq!(id, None);
            assert_eq!(error.code, ErrorCode::BadRequest);
        }
    }

    #[test]
    fn keeps_the_id_when_method_or_params_are_invalid() {
        let (id, _) = parse_request(br#"{"id":4}"#).unwrap_err();
        assert_eq!(id, Some(4));
        let (id, _) = parse_request(br#"{"id":5,"method":"hello","params":[1]}"#).unwrap_err();
        assert_eq!(id, Some(5));
    }

    #[test]
    fn serializes_responses_and_errors() {
        let response = Outgoing::Response {
            id: 2,
            result: json!({ "ok": true }),
        };
        assert_eq!(
            response.to_value(),
            json!({ "id": 2, "result": { "ok": true } })
        );

        let error = Outgoing::Error {
            id: None,
            error: ProtocolError::new(ErrorCode::BadRequest, "bad"),
        };
        assert_eq!(
            error.to_value(),
            json!({ "id": null, "error": { "code": "BAD_REQUEST", "message": "bad" } })
        );
    }

    #[test]
    fn oversized_responses_become_too_large_errors() {
        let response = Outgoing::Response {
            id: 9,
            result: Value::String("x".repeat(MAX_OUTBOUND)),
        };
        let encoded: Value = serde_json::from_slice(&encode(&response)).unwrap();
        assert_eq!(encoded["id"], json!(9));
        assert_eq!(encoded["error"]["code"], json!("TOO_LARGE"));
    }
}
