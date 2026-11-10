//! Clipboard, frontmost-app and keystroke access, one implementation per operating system.
//!
//! Every backend exposes the same functions. Contents travel as `(type, bytes)` pairs
//! named after the macOS pasteboard types in `history`, whatever the system calls them.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(not(target_os = "macos"))]
mod desktop;
#[cfg(not(target_os = "macos"))]
pub use desktop::*;

pub struct FrontApp {
    pub pid: i32,
    /// macOS bundle identifier; on Windows the executable's file name, such as `KeePass.exe`.
    pub bundle_id: Option<String>,
    pub name: Option<String>,
}
