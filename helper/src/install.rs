//! Per-user install and uninstall of the helper as a native messaging host for
//! Chrome, Edge, Brave, and Chromium (see architecture.md, Helper registration).

use std::ffi::OsString;
use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};

use serde_json::json;

use crate::identity::{ALLOWED_ORIGIN, HOST_NAME, MANIFEST_FILE};

/// Browsers the helper registers with, in the order they are reported.
pub const BROWSERS: [&str; 4] = ["Chrome", "Edge", "Brave", "Chromium"];

/// Registry roots under `HKEY_CURRENT_USER\Software`, in [`BROWSERS`] order.
const WINDOWS_REGISTRY_ROOTS: [&str; 4] = [
    r"Google\Chrome",
    r"Microsoft\Edge",
    r"BraveSoftware\Brave-Browser",
    "Chromium",
];

/// Browser folders under `~/Library/Application Support`, in [`BROWSERS`] order.
const MACOS_BROWSER_DIRS: [&str; 4] = [
    "Google/Chrome",
    "Microsoft Edge",
    "BraveSoftware/Brave-Browser",
    "Chromium",
];

/// Browser folders under the XDG config home, in [`BROWSERS`] order.
const LINUX_BROWSER_DIRS: [&str; 4] = [
    "google-chrome",
    "microsoft-edge",
    "BraveSoftware/Brave-Browser",
    "chromium",
];

/// Operating systems with distinct install layouts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetOs {
    Windows,
    MacOs,
    Linux,
}

impl TargetOs {
    /// The layout for the OS this binary was compiled for.
    pub fn current() -> Self {
        if cfg!(windows) {
            TargetOs::Windows
        } else if cfg!(target_os = "macos") {
            TargetOs::MacOs
        } else {
            TargetOs::Linux
        }
    }
}

/// Where the helper binary, its manifests, and its registry keys go.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallPlan {
    pub install_dir: PathBuf,
    pub binary: PathBuf,
    pub manifests: Vec<PathBuf>,
    pub registry_keys: Vec<String>,
}

/// Read a non-empty environment variable as a path.
fn path_var(var: &impl Fn(&str) -> Option<OsString>, name: &str) -> Option<PathBuf> {
    var(name).filter(|value| !value.is_empty()).map(PathBuf::from)
}

/// Read an XDG base-directory variable; the specification ignores relative values.
fn xdg_var(var: &impl Fn(&str) -> Option<OsString>, name: &str) -> Option<PathBuf> {
    path_var(var, name).filter(|path| path.to_string_lossy().starts_with('/'))
}

/// Compute the install layout for an OS from its environment variables.
pub fn plan_for(
    os: TargetOs,
    var: impl Fn(&str) -> Option<OsString>,
) -> Result<InstallPlan, String> {
    match os {
        TargetOs::Windows => {
            let local = path_var(&var, "LOCALAPPDATA")
                .ok_or("LOCALAPPDATA is not set, so the install folder is unknown.")?;
            let install_dir = local.join("Quire").join("Helper");
            Ok(InstallPlan {
                binary: install_dir.join("quire-helper.exe"),
                manifests: vec![install_dir.join(MANIFEST_FILE)],
                registry_keys: WINDOWS_REGISTRY_ROOTS
                    .iter()
                    .map(|root| format!(r"Software\{root}\NativeMessagingHosts\{HOST_NAME}"))
                    .collect(),
                install_dir,
            })
        }
        TargetOs::MacOs => {
            let home =
                path_var(&var, "HOME").ok_or("HOME is not set, so the install folder is unknown.")?;
            let support = home.join("Library").join("Application Support");
            let install_dir = support.join("Quire").join("Helper");
            Ok(InstallPlan {
                binary: install_dir.join("quire-helper"),
                manifests: MACOS_BROWSER_DIRS
                    .iter()
                    .map(|dir| support.join(dir).join("NativeMessagingHosts").join(MANIFEST_FILE))
                    .collect(),
                registry_keys: Vec::new(),
                install_dir,
            })
        }
        TargetOs::Linux => {
            let home = path_var(&var, "HOME");
            let data = xdg_var(&var, "XDG_DATA_HOME")
                .or_else(|| home.as_ref().map(|home| home.join(".local").join("share")))
                .ok_or("Neither XDG_DATA_HOME nor HOME is set, so the install folder is unknown.")?;
            let config = xdg_var(&var, "XDG_CONFIG_HOME")
                .or_else(|| home.as_ref().map(|home| home.join(".config")))
                .ok_or("Neither XDG_CONFIG_HOME nor HOME is set, so the browser folders are unknown.")?;
            let install_dir = data.join("quire").join("helper");
            Ok(InstallPlan {
                binary: install_dir.join("quire-helper"),
                manifests: LINUX_BROWSER_DIRS
                    .iter()
                    .map(|dir| config.join(dir).join("NativeMessagingHosts").join(MANIFEST_FILE))
                    .collect(),
                registry_keys: Vec::new(),
                install_dir,
            })
        }
    }
}

/// The host manifest that tells a browser how to launch the helper.
pub fn manifest_json(binary: &Path) -> String {
    let manifest = json!({
        "name": HOST_NAME,
        "description": "Quire Helper: reads and writes your Quire notes folder and keeps it synced with Git.",
        "path": binary.to_string_lossy(),
        "type": "stdio",
        "allowed_origins": [ALLOWED_ORIGIN],
    });
    let mut text = serde_json::to_string_pretty(&manifest).unwrap_or_else(|_| manifest.to_string());
    text.push('\n');
    text
}

/// True when both paths resolve to the same existing file.
fn same_file(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Remove a file, treating "already gone" as success.
fn remove_if_present(path: &Path) -> io::Result<bool> {
    match fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

/// Copy the running binary into the install location, replacing an older copy.
/// Returns false when the helper is already running from there.
fn place_binary(plan: &InstallPlan, current: &Path) -> io::Result<bool> {
    if same_file(current, &plan.binary) {
        return Ok(false);
    }
    fs::create_dir_all(&plan.install_dir)?;
    let staging = plan.binary.with_extension("new");
    fs::copy(current, &staging)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&staging, fs::Permissions::from_mode(0o755))?;
    }

    if let Err(error) = fs::rename(&staging, &plan.binary) {
        let _ = fs::remove_file(&staging);
        if error.kind() == ErrorKind::PermissionDenied {
            return Err(io::Error::new(
                error.kind(),
                format!(
                    "{} is in use. Close every Quire tab, then run install again.",
                    plan.binary.display()
                ),
            ));
        }
        return Err(error);
    }

    #[cfg(target_os = "macos")]
    {
        // A downloaded binary carries the quarantine flag, which stops the browser from launching it.
        let _ = std::process::Command::new("/usr/bin/xattr")
            .args(["-d", "com.apple.quarantine"])
            .arg(&plan.binary)
            .stderr(std::process::Stdio::null())
            .status();
    }
    Ok(true)
}

/// Point every browser's registry key at the manifest (Windows only).
fn write_registry(plan: &InstallPlan) -> io::Result<()> {
    #[cfg(windows)]
    {
        use winreg::RegKey;
        use winreg::enums::HKEY_CURRENT_USER;

        let manifest = plan
            .manifests
            .first()
            .ok_or_else(|| io::Error::other("no manifest path for the registry"))?
            .to_string_lossy()
            .into_owned();
        let user = RegKey::predef(HKEY_CURRENT_USER);
        for key in &plan.registry_keys {
            let (entry, _) = user.create_subkey(key)?;
            entry.set_value("", &manifest)?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        if plan.registry_keys.is_empty() {
            Ok(())
        } else {
            Err(io::Error::other("registry keys exist only on Windows"))
        }
    }
}

/// Delete every browser's registry key (Windows only).
fn delete_registry(plan: &InstallPlan) -> io::Result<()> {
    #[cfg(windows)]
    {
        use winreg::RegKey;
        use winreg::enums::HKEY_CURRENT_USER;

        let user = RegKey::predef(HKEY_CURRENT_USER);
        for key in &plan.registry_keys {
            match user.delete_subkey_all(key) {
                Ok(()) => {}
                Err(error) if error.kind() == ErrorKind::NotFound => {}
                Err(error) => return Err(error),
            }
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        if plan.registry_keys.is_empty() {
            Ok(())
        } else {
            Err(io::Error::other("registry keys exist only on Windows"))
        }
    }
}

/// Install the running binary and register it with every supported browser.
pub fn install(plan: &InstallPlan) -> io::Result<String> {
    let current = std::env::current_exe()?;
    let copied = place_binary(plan, &current)?;
    let manifest = manifest_json(&plan.binary);
    for path in &plan.manifests {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, &manifest)?;
    }
    write_registry(plan)?;

    let action = if copied { "installed" } else { "re-registered" };
    Ok(format!(
        "Quire Helper {} {action}.\n  Program: {}\n  Registered for {}.\nReturn to the Quire tab and select Retry.",
        env!("CARGO_PKG_VERSION"),
        plan.binary.display(),
        BROWSERS.join(", "),
    ))
}

/// Remove the registrations, the manifests, and (when not running from it) the installed binary.
pub fn uninstall(plan: &InstallPlan) -> io::Result<String> {
    delete_registry(plan)?;
    for path in &plan.manifests {
        remove_if_present(path)?;
    }

    let current = std::env::current_exe()?;
    let mut report = format!(
        "Quire Helper is no longer registered with {}.",
        BROWSERS.join(", ")
    );
    if same_file(&current, &plan.binary) {
        report.push_str(&format!(
            "\nDelete {} yourself; a running program cannot remove itself.",
            plan.install_dir.display()
        ));
    } else {
        remove_if_present(&plan.binary)?;
        let _ = fs::remove_dir(&plan.install_dir);
        if let Some(parent) = plan.install_dir.parent() {
            let _ = fs::remove_dir(parent);
        }
        report.push_str("\nThe installed program was removed.");
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    /// Build an environment lookup from fixed pairs.
    fn env(pairs: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<OsString> {
        move |name| {
            pairs
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| OsString::from(value))
        }
    }

    #[test]
    fn windows_plan_uses_local_app_data_and_four_registry_keys() {
        let plan = plan_for(
            TargetOs::Windows,
            env(&[("LOCALAPPDATA", r"C:\Users\ana\AppData\Local")]),
        )
        .unwrap();
        let dir = PathBuf::from(r"C:\Users\ana\AppData\Local")
            .join("Quire")
            .join("Helper");
        assert_eq!(plan.binary, dir.join("quire-helper.exe"));
        assert_eq!(plan.manifests, vec![dir.join("com.quire.helper.json")]);
        assert_eq!(
            plan.registry_keys,
            vec![
                r"Software\Google\Chrome\NativeMessagingHosts\com.quire.helper",
                r"Software\Microsoft\Edge\NativeMessagingHosts\com.quire.helper",
                r"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.quire.helper",
                r"Software\Chromium\NativeMessagingHosts\com.quire.helper",
            ]
        );
    }

    #[test]
    fn macos_plan_writes_one_manifest_per_browser() {
        let plan = plan_for(TargetOs::MacOs, env(&[("HOME", "/Users/ana")])).unwrap();
        let support = PathBuf::from("/Users/ana/Library/Application Support");
        assert_eq!(plan.binary, support.join("Quire/Helper/quire-helper"));
        assert_eq!(
            plan.manifests,
            vec![
                support.join("Google/Chrome/NativeMessagingHosts/com.quire.helper.json"),
                support.join("Microsoft Edge/NativeMessagingHosts/com.quire.helper.json"),
                support.join("BraveSoftware/Brave-Browser/NativeMessagingHosts/com.quire.helper.json"),
                support.join("Chromium/NativeMessagingHosts/com.quire.helper.json"),
            ]
        );
        assert!(plan.registry_keys.is_empty());
    }

    #[test]
    fn linux_plan_follows_xdg_defaults() {
        let plan = plan_for(TargetOs::Linux, env(&[("HOME", "/home/ana")])).unwrap();
        assert_eq!(
            plan.binary,
            PathBuf::from("/home/ana/.local/share/quire/helper/quire-helper")
        );
        assert_eq!(
            plan.manifests[0],
            PathBuf::from("/home/ana/.config/google-chrome/NativeMessagingHosts/com.quire.helper.json")
        );
        assert_eq!(plan.manifests.len(), 4);
    }

    #[test]
    fn linux_plan_prefers_absolute_xdg_overrides() {
        let plan = plan_for(
            TargetOs::Linux,
            env(&[
                ("HOME", "/home/ana"),
                ("XDG_DATA_HOME", "/data"),
                ("XDG_CONFIG_HOME", "relative/ignored"),
            ]),
        )
        .unwrap();
        assert_eq!(plan.install_dir, PathBuf::from("/data/quire/helper"));
        assert!(plan.manifests[3].starts_with("/home/ana/.config/chromium"));
    }

    #[test]
    fn missing_environment_is_an_error() {
        assert!(plan_for(TargetOs::Windows, env(&[])).is_err());
        assert!(plan_for(TargetOs::MacOs, env(&[])).is_err());
        assert!(plan_for(TargetOs::Linux, env(&[])).is_err());
    }

    #[test]
    fn manifest_allows_only_the_quire_extension() {
        let manifest: Value =
            serde_json::from_str(&manifest_json(Path::new("/opt/quire-helper"))).unwrap();
        assert_eq!(manifest["name"], "com.quire.helper");
        assert_eq!(manifest["type"], "stdio");
        assert_eq!(manifest["path"], "/opt/quire-helper");
        assert_eq!(
            manifest["allowed_origins"],
            serde_json::json!(["chrome-extension://hbddhigdogedopjjlihlkpehidopddac/"])
        );
    }
}
