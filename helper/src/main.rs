//! Quire Helper entry point: native messaging host mode when a browser launches
//! it, and install, uninstall, version, and help commands otherwise.

mod body;
mod config;
mod dirs;
mod framing;
mod git;
mod host;
mod identity;
mod install;
mod pageops;
mod pages;
mod paths;
mod protocol;
mod sync;
#[cfg(test)]
mod testdir;
mod watch;
mod workspace;

use std::io::{self, BufRead, IsTerminal, Write};
use std::process::ExitCode;

use identity::PROTOCOL_VERSION;
use install::{InstallPlan, TargetOs, plan_for};

const USAGE: &str = "\
Quire Helper lets the Quire browser extension read and write your notes folder.

Usage:
  quire-helper             Install for this user (same as install)
  quire-helper install     Install and register with Chrome, Edge, Brave, and Chromium
  quire-helper uninstall   Remove the registrations and the installed program
  quire-helper version     Print the helper and protocol versions
  quire-helper help        Show this message";

/// Dispatch on the first argument.
fn main() -> ExitCode {
    let first = std::env::args().nth(1);
    match first.as_deref() {
        Some(origin) if origin.starts_with("chrome-extension://") => host::run(origin),
        None => {
            let code = run_command(install::install);
            pause_for_double_click();
            code
        }
        Some("install") => run_command(install::install),
        Some("uninstall") => run_command(install::uninstall),
        Some("version" | "--version" | "-V") => {
            println!(
                "quire-helper {} (protocol {PROTOCOL_VERSION})",
                env!("CARGO_PKG_VERSION")
            );
            ExitCode::SUCCESS
        }
        Some("help" | "--help" | "-h") => {
            println!("{USAGE}");
            ExitCode::SUCCESS
        }
        Some(other) => {
            eprintln!("Unknown command \"{other}\".\n\n{USAGE}");
            ExitCode::from(64)
        }
    }
}

/// Build the install plan for this OS and run an install or uninstall step with it.
fn run_command(step: fn(&InstallPlan) -> io::Result<String>) -> ExitCode {
    let plan = match plan_for(TargetOs::current(), process_var) {
        Ok(plan) => plan,
        Err(error) => {
            eprintln!("quire-helper: {error}");
            return ExitCode::FAILURE;
        }
    };
    match step(&plan) {
        Ok(report) => {
            println!("{report}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("quire-helper: {error}");
            ExitCode::FAILURE
        }
    }
}

/// Read one variable from this process's environment.
fn process_var(name: &str) -> Option<std::ffi::OsString> {
    std::env::var_os(name)
}

/// Keep a double-clicked Windows console open until the user has read the result.
fn pause_for_double_click() {
    if cfg!(windows) && io::stdin().is_terminal() {
        print!("Press Enter to close this window.");
        let _ = io::stdout().flush();
        let _ = io::stdin().lock().read_line(&mut String::new());
    }
}
