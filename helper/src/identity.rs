//! Fixed identity values shared with the extension (see architecture.md, Extension identity).
//! These must change together with `apps/extension/src/shared/identity.ts`.

/// Native messaging host name registered with each browser.
pub const HOST_NAME: &str = "com.quire.helper";

/// Extension ID derived from the public key in the extension manifest.
pub const EXTENSION_ID: &str = "hbddhigdogedopjjlihlkpehidopddac";

/// The only caller origin the helper accepts.
pub const ALLOWED_ORIGIN: &str = "chrome-extension://hbddhigdogedopjjlihlkpehidopddac/";

/// Major version of the native messaging protocol this helper speaks.
pub const PROTOCOL_VERSION: u64 = 1;

/// File name of the host manifest written during install.
pub const MANIFEST_FILE: &str = "com.quire.helper.json";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_origin_is_built_from_the_extension_id() {
        assert_eq!(
            ALLOWED_ORIGIN,
            format!("chrome-extension://{EXTENSION_ID}/")
        );
    }

    #[test]
    fn manifest_file_matches_host_name() {
        assert_eq!(MANIFEST_FILE, format!("{HOST_NAME}.json"));
    }

    #[test]
    fn host_name_uses_only_allowed_characters() {
        assert!(
            HOST_NAME
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '_')
        );
    }
}
