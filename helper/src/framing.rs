//! Native messaging frame encoding: a 32-bit length prefix followed by UTF-8 JSON.
//! Chrome uses native byte order; every supported target is little-endian.

use std::fmt;
use std::io::{self, ErrorKind, Read, Write};

/// Largest message Chrome accepts from a native host.
pub const MAX_OUTBOUND: usize = 1024 * 1024;

/// Largest message the helper accepts from the extension.
pub const MAX_INBOUND: usize = 64 * 1024 * 1024;

/// Why reading a frame stopped.
#[derive(Debug)]
pub enum ReadError {
    /// The stream closed cleanly between frames.
    Eof,
    /// The stream closed in the middle of a frame.
    Truncated,
    /// The length prefix exceeds [`MAX_INBOUND`].
    TooLarge(u32),
    /// The underlying read failed.
    Io(io::Error),
}

impl fmt::Display for ReadError {
    /// Describe the read failure for diagnostics on standard error.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ReadError::Eof => write!(f, "input closed"),
            ReadError::Truncated => write!(f, "input closed in the middle of a message"),
            ReadError::TooLarge(len) => write!(
                f,
                "incoming message of {len} bytes exceeds the {MAX_INBOUND}-byte limit"
            ),
            ReadError::Io(error) => write!(f, "read failed: {error}"),
        }
    }
}

/// Read one frame and return its payload bytes.
pub fn read_frame<R: Read>(input: &mut R) -> Result<Vec<u8>, ReadError> {
    let mut prefix = [0u8; 4];
    let mut filled = 0;
    while filled < prefix.len() {
        match input.read(&mut prefix[filled..]) {
            Ok(0) if filled == 0 => return Err(ReadError::Eof),
            Ok(0) => return Err(ReadError::Truncated),
            Ok(count) => filled += count,
            Err(error) if error.kind() == ErrorKind::Interrupted => {}
            Err(error) => return Err(ReadError::Io(error)),
        }
    }

    let length = u32::from_le_bytes(prefix);
    let size = usize::try_from(length).map_err(|_| ReadError::TooLarge(length))?;
    if size > MAX_INBOUND {
        return Err(ReadError::TooLarge(length));
    }

    let mut payload = vec![0u8; size];
    input.read_exact(&mut payload).map_err(|error| {
        if error.kind() == ErrorKind::UnexpectedEof {
            ReadError::Truncated
        } else {
            ReadError::Io(error)
        }
    })?;
    Ok(payload)
}

/// Write one frame and flush it so the browser receives it immediately.
pub fn write_frame<W: Write>(output: &mut W, payload: &[u8]) -> io::Result<()> {
    if payload.len() > MAX_OUTBOUND {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            format!(
                "outgoing message of {} bytes exceeds the {MAX_OUTBOUND}-byte limit",
                payload.len()
            ),
        ));
    }
    let length = u32::try_from(payload.len())
        .map_err(|_| io::Error::new(ErrorKind::InvalidInput, "message too large"))?;
    output.write_all(&length.to_le_bytes())?;
    output.write_all(payload)?;
    output.flush()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    /// Build a framed message from a payload.
    fn framed(payload: &[u8]) -> Vec<u8> {
        let mut bytes = (payload.len() as u32).to_le_bytes().to_vec();
        bytes.extend_from_slice(payload);
        bytes
    }

    #[test]
    fn reads_consecutive_frames_then_eof() {
        let mut bytes = framed(b"{\"a\":1}");
        bytes.extend(framed(b"{}"));
        let mut input = Cursor::new(bytes);
        assert_eq!(read_frame(&mut input).unwrap(), b"{\"a\":1}");
        assert_eq!(read_frame(&mut input).unwrap(), b"{}");
        assert!(matches!(read_frame(&mut input), Err(ReadError::Eof)));
    }

    #[test]
    fn reports_truncated_prefix_and_payload() {
        let mut short_prefix = Cursor::new(vec![3u8, 0]);
        assert!(matches!(
            read_frame(&mut short_prefix),
            Err(ReadError::Truncated)
        ));

        let mut short_payload = Cursor::new(vec![5u8, 0, 0, 0, b'{']);
        assert!(matches!(
            read_frame(&mut short_payload),
            Err(ReadError::Truncated)
        ));
    }

    #[test]
    fn rejects_oversized_inbound_frames_without_allocating() {
        let length = (MAX_INBOUND as u32) + 1;
        let mut input = Cursor::new(length.to_le_bytes().to_vec());
        assert!(matches!(read_frame(&mut input), Err(ReadError::TooLarge(l)) if l == length));
    }

    #[test]
    fn writes_little_endian_prefix() {
        let mut output = Vec::new();
        write_frame(&mut output, b"{}").unwrap();
        assert_eq!(output, vec![2, 0, 0, 0, b'{', b'}']);
    }

    #[test]
    fn refuses_outbound_frames_over_the_browser_limit() {
        let payload = vec![b' '; MAX_OUTBOUND + 1];
        let mut output = Vec::new();
        assert!(write_frame(&mut output, &payload).is_err());
        assert!(output.is_empty());
    }
}
