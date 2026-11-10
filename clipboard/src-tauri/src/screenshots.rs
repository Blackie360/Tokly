//! Notices screenshots that macOS saves to disk so they can join the history.
//!
//! macOS tags every screenshot file with an extended attribute, which is what
//! tells a screenshot apart from any other image landing in the same folder.

use crate::history::{Raw, PNG, TIFF};
use std::collections::{HashMap, HashSet};
use std::ffi::{c_char, c_int, c_void, CString};
use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const SCREENSHOT_ATTRIBUTE: &str = "com.apple.metadata:kMDItemIsScreenCapture";
/// How long a new file may take to receive the screenshot tag before it is dismissed.
const TAG_GRACE: Duration = Duration::from_secs(5);
/// How often the configured screenshot folder is looked up again.
const FOLDER_REFRESH: Duration = Duration::from_secs(10);

extern "C" {
    fn getxattr(
        path: *const c_char,
        name: *const c_char,
        value: *mut c_void,
        size: usize,
        position: u32,
        options: c_int,
    ) -> isize;
}

pub fn is_screenshot(path: &Path) -> bool {
    let (Ok(path), Ok(name)) = (
        CString::new(path.as_os_str().as_bytes()),
        CString::new(SCREENSHOT_ATTRIBUTE),
    ) else {
        return false;
    };
    unsafe { getxattr(path.as_ptr(), name.as_ptr(), std::ptr::null_mut(), 0, 0, 0) >= 0 }
}

/// The folder macOS saves screenshots to: the user's chosen location, or the Desktop.
pub fn folder() -> PathBuf {
    let home = PathBuf::from(std::env::var_os("HOME").unwrap_or_default());
    let chosen = std::process::Command::new("/usr/bin/defaults")
        .args(["read", "com.apple.screencapture", "location"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|location| !location.is_empty());
    match chosen {
        Some(location) if location == "~" => home,
        Some(location) => match location.strip_prefix("~/") {
            Some(rest) => home.join(rest),
            None => PathBuf::from(location),
        },
        None => home.join("Desktop"),
    }
}

pub struct Watcher {
    folder: PathBuf,
    fixed_folder: bool,
    folder_checked: Instant,
    /// Files already dealt with. `None` until the first look, which only takes stock.
    seen: Option<HashSet<PathBuf>>,
    /// New files being watched: when first noticed, and their size at the last look.
    pending: HashMap<PathBuf, (Instant, u64)>,
}

impl Watcher {
    pub fn new() -> Watcher {
        Watcher::watching(folder(), false)
    }

    fn watching(folder: PathBuf, fixed_folder: bool) -> Watcher {
        Watcher {
            folder,
            fixed_folder,
            folder_checked: Instant::now(),
            seen: None,
            pending: HashMap::new(),
        }
    }

    /// Returns screenshots that appeared since the last call and have finished being written.
    /// Files that were already there when watching began are never returned.
    pub fn poll(&mut self) -> Vec<PathBuf> {
        if !self.fixed_folder && self.folder_checked.elapsed() >= FOLDER_REFRESH {
            self.folder_checked = Instant::now();
            let current = folder();
            if current != self.folder {
                *self = Watcher::watching(current, false);
            }
        }

        let Ok(entries) = std::fs::read_dir(&self.folder) else {
            return vec![];
        };
        let files: Vec<(PathBuf, u64)> = entries
            .filter_map(|entry| entry.ok())
            .filter(|entry| !entry.file_name().as_bytes().starts_with(b"."))
            .filter_map(|entry| {
                let metadata = entry.metadata().ok()?;
                metadata.is_file().then(|| (entry.path(), metadata.len()))
            })
            .collect();
        let present: HashSet<PathBuf> = files.iter().map(|file| file.0.clone()).collect();

        let Some(seen) = self.seen.as_mut() else {
            self.seen = Some(present);
            return vec![];
        };
        seen.retain(|path| present.contains(path));
        self.pending.retain(|path, _| present.contains(path));

        let mut ready = vec![];
        for (path, size) in files {
            if seen.contains(&path) {
                continue;
            }
            let (first_noticed, last_size) = *self
                .pending
                .entry(path.clone())
                .or_insert((Instant::now(), u64::MAX));
            if is_screenshot(&path) && size > 0 && size == last_size {
                ready.push(path.clone());
            } else if first_noticed.elapsed() < TAG_GRACE || is_screenshot(&path) {
                self.pending.insert(path, (first_noticed, size));
                continue;
            }
            self.pending.remove(&path);
            seen.insert(path);
        }
        ready
    }
}

/// Reads a screenshot file as history contents. JPEG screenshots are converted to PNG;
/// formats the history cannot show (HEIC, PDF) are skipped.
pub fn load(path: &Path) -> Option<Raw> {
    let bytes = std::fs::read(path).ok()?;
    match image::guess_format(&bytes).ok()? {
        image::ImageFormat::Png => Some((PNG.to_string(), bytes)),
        image::ImageFormat::Tiff => Some((TIFF.to_string(), bytes)),
        image::ImageFormat::Jpeg => {
            let decoded = image::load_from_memory(&bytes).ok()?;
            let mut png = std::io::Cursor::new(Vec::new());
            decoded.write_to(&mut png, image::ImageFormat::Png).ok()?;
            Some((PNG.to_string(), png.into_inner()))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    extern "C" {
        fn setxattr(
            path: *const c_char,
            name: *const c_char,
            value: *const c_void,
            size: usize,
            position: u32,
            options: c_int,
        ) -> c_int;
    }

    fn tag_as_screenshot(path: &Path) {
        let path = CString::new(path.as_os_str().as_bytes()).unwrap();
        let name = CString::new(SCREENSHOT_ATTRIBUTE).unwrap();
        let value = b"bplist00\x09";
        let status = unsafe {
            setxattr(
                path.as_ptr(),
                name.as_ptr(),
                value.as_ptr() as *const c_void,
                value.len(),
                0,
                0,
            )
        };
        assert_eq!(status, 0);
    }

    fn png_bytes() -> Vec<u8> {
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(8, 6)
            .write_to(&mut png, image::ImageFormat::Png)
            .unwrap();
        png.into_inner()
    }

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("tokly-shots-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_new_tagged_files_are_reported_once() {
        let dir = temp();
        let old = dir.join("Screenshot old.png");
        std::fs::write(&old, png_bytes()).unwrap();
        tag_as_screenshot(&old);

        let mut watcher = Watcher::watching(dir.clone(), true);
        assert!(
            watcher.poll().is_empty(),
            "files present at start are only taken stock of"
        );

        let shot = dir.join("Screenshot new.png");
        std::fs::write(&shot, png_bytes()).unwrap();
        tag_as_screenshot(&shot);
        std::fs::write(dir.join("download.png"), png_bytes()).unwrap();
        std::fs::write(dir.join(".Screenshot partial.png"), png_bytes()).unwrap();

        assert!(
            watcher.poll().is_empty(),
            "a new file must hold its size for one look first"
        );
        assert_eq!(watcher.poll(), vec![shot.clone()]);
        assert!(
            watcher.poll().is_empty(),
            "each screenshot is reported once"
        );
        assert!(!is_screenshot(&dir.join("download.png")));
    }

    #[test]
    fn waits_while_a_screenshot_is_still_growing() {
        let dir = temp();
        let mut watcher = Watcher::watching(dir.clone(), true);
        watcher.poll();

        let shot = dir.join("Screenshot.png");
        std::fs::write(&shot, b"partial").unwrap();
        tag_as_screenshot(&shot);
        assert!(watcher.poll().is_empty());
        std::fs::write(&shot, png_bytes()).unwrap();
        tag_as_screenshot(&shot);
        assert!(
            watcher.poll().is_empty(),
            "size changed since the last look"
        );
        assert_eq!(watcher.poll(), vec![shot]);
    }

    #[test]
    fn loads_png_and_converts_jpeg() {
        let dir = temp();
        let png = dir.join("a.png");
        std::fs::write(&png, png_bytes()).unwrap();
        assert_eq!(load(&png).unwrap(), (PNG.to_string(), png_bytes()));

        let jpeg = dir.join("b.jpg");
        image::DynamicImage::new_rgb8(8, 6)
            .save_with_format(&jpeg, image::ImageFormat::Jpeg)
            .unwrap();
        let (kind, data) = load(&jpeg).unwrap();
        assert_eq!(kind, PNG);
        assert_eq!(image::guess_format(&data).unwrap(), image::ImageFormat::Png);

        let text = dir.join("c.png");
        std::fs::write(&text, b"not an image").unwrap();
        assert!(load(&text).is_none());
    }
}
