# Native helper

## Outcome or responsibility

The `quire-helper` Rust binary: it runs as the native messaging host for the app page, installs and registers itself per user for Chrome, Edge, Brave, and Chromium, and later owns disk access, file watching, search, and Git for the notes folder.

## Current verified status

**Status:** Planned

Slices 1 and 2 deliver the host loop, the `hello` handshake, and `install` and `uninstall`.

## Architecture dependencies

- [Extension identity](../architecture.md#extension-identity): `helper/src/identity.rs` holds the allowed origin and the host name.
- [Native messaging protocol](../architecture.md#native-messaging-protocol): `helper/src/framing.rs` implements the length prefix and both size limits; `helper/src/host.rs` implements the envelope, the handshake gate, and the error codes.
- [Helper registration](../architecture.md#helper-registration): `helper/src/install.rs` implements the per-OS paths, the manifest, and the Windows registry keys.
- [Notes folder and path safety](../architecture.md#notes-folder-and-path-safety): planned for slice 3.

## Local rules and implications

- Command line: an origin argument starting with `chrome-extension://` selects host mode. `install`, `uninstall`, `version`, and `help` are subcommands. No arguments means `install`, and on Windows the console waits for Enter so a double-click shows the result.
- Host mode reads requests on the main thread and sends all output through one writer thread, so later watcher and Git threads can emit events without interleaving frames.
- A malformed JSON frame gets a `BAD_REQUEST` response with `id: null`, and the loop continues. A frame over the inbound limit, or a truncated frame, ends the process.
- `install` copies the running binary into the install location unless it is already running from there. On Windows, a running helper locks the file; `install` then reports that Quire tabs must be closed first.
- Uninstall removes the registrations and the manifest. It removes the binary when it is not the running process; otherwise it reports the path to delete.

## Related blueprints

### Required

None

### Impact checks

- [extension-shell](extension-shell.md): check when protocol methods, error codes, or the handshake change.
- [build-pipeline](build-pipeline.md): check when targets, crates with build scripts, or the install smoke test change.

## Relevant implementation and tests

- `helper/src/main.rs`: command dispatch
- `helper/src/framing.rs`, `helper/src/host.rs`, `helper/src/protocol.rs`: host mode, with unit tests in each module
- `helper/src/install.rs`: registration, with unit tests for paths and manifest content
- `.github/workflows/ci.yml` `helper` job: install smoke test per OS

## Acceptance or verification criteria

- [ ] `hello` with protocol 1 returns the helper version, protocol, OS, and architecture.
- [ ] `hello` with another protocol returns `PROTOCOL_MISMATCH`; other methods before `hello` return `BAD_REQUEST`; unknown methods return `UNKNOWN_METHOD`.
- [ ] A disallowed origin argument makes the helper exit non-zero without reading input.
- [ ] `install` then `uninstall` writes and removes the manifests (macOS, Linux) or registry keys (Windows) in CI.

## Remaining gaps and unknowns

- Binaries are unsigned. macOS users must clear the quarantine attribute.
- ARM Windows and ARM Linux builds are not produced yet.
