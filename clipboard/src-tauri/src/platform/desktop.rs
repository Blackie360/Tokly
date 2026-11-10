//! Windows and Linux backend, built on `arboard`.
//!
//! Compared with macOS: rich text (RTF) is not carried, and an item is written back as
//! one thing (files, else an image, else text with its HTML). Linux has no clipboard
//! change counter, so changes are detected by fingerprinting what is on the clipboard.

use super::FrontApp;
use crate::history::{Raw, FILE_URL, HTML, PNG, STRING, TIFF};
use arboard::{Clipboard, ImageData};
use std::borrow::Cow;
use std::path::PathBuf;
use std::sync::Mutex;

/// Reported by `pasteboard_types` when the source asked clipboard managers to skip the copy.
const CONCEALED: &str = "org.nspasteboard.ConcealedType";

/// One long-lived handle: on Linux the clipboard's contents live in the process that set them.
static CLIPBOARD: Mutex<Option<Clipboard>> = Mutex::new(None);

fn with_clipboard<T>(run: impl FnOnce(&mut Clipboard) -> T) -> Option<T> {
    let mut guard = CLIPBOARD.lock().ok()?;
    if guard.is_none() {
        *guard = Clipboard::new().ok();
    }
    guard.as_mut().map(run)
}

struct Snapshot {
    files: Vec<PathBuf>,
    text: Option<String>,
    html: Option<String>,
    image: Option<ImageData<'static>>,
}

fn snapshot() -> Snapshot {
    with_clipboard(|clipboard| Snapshot {
        files: clipboard.get().file_list().unwrap_or_default(),
        text: clipboard.get_text().ok().filter(|text| !text.is_empty()),
        html: clipboard.get().html().ok().filter(|html| !html.is_empty()),
        image: clipboard.get_image().ok(),
    })
    .unwrap_or(Snapshot {
        files: vec![],
        text: None,
        html: None,
        image: None,
    })
}

#[cfg(windows)]
pub fn change_count() -> isize {
    unsafe { windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber() as isize }
}

#[cfg(not(windows))]
pub fn change_count() -> isize {
    use std::hash::{Hash, Hasher};
    static SEEN: Mutex<(u64, isize)> = Mutex::new((0, 0));

    let current = snapshot();
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    current.files.hash(&mut hasher);
    current.text.hash(&mut hasher);
    current.html.hash(&mut hasher);
    if let Some(image) = &current.image {
        (image.width, image.height).hash(&mut hasher);
        image.bytes.hash(&mut hasher);
    }
    let fingerprint = hasher.finish();

    let mut seen = SEEN.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if seen.0 != fingerprint {
        *seen = (fingerprint, seen.1 + 1);
    }
    seen.1
}

/// Windows marks copies that clipboard managers must skip with a registered format,
/// which is what password managers set. Linux offers no way to ask through `arboard`.
#[cfg(windows)]
pub fn pasteboard_types() -> Vec<String> {
    use windows_sys::Win32::System::DataExchange::{
        IsClipboardFormatAvailable, RegisterClipboardFormatW,
    };
    let name: Vec<u16> = "ExcludeClipboardContentFromMonitorProcessing\0"
        .encode_utf16()
        .collect();
    let excluded = unsafe {
        let format = RegisterClipboardFormatW(name.as_ptr());
        format != 0 && IsClipboardFormatAvailable(format) != 0
    };
    if excluded {
        vec![CONCEALED.to_string()]
    } else {
        vec![]
    }
}

#[cfg(not(windows))]
pub fn pasteboard_types() -> Vec<String> {
    let _ = CONCEALED;
    vec![]
}

fn png_from(image: &ImageData) -> Option<Vec<u8>> {
    let pixels = image::RgbaImage::from_raw(
        image.width as u32,
        image.height as u32,
        image.bytes.to_vec(),
    )?;
    let mut png = std::io::Cursor::new(Vec::new());
    pixels.write_to(&mut png, image::ImageFormat::Png).ok()?;
    Some(png.into_inner())
}

/// Reads the wanted kinds of what is on the clipboard: files, then text, HTML and image.
pub fn read(wanted: impl Fn(&str, &[String]) -> bool) -> Vec<Raw> {
    let current = snapshot();
    let mut kinds: Vec<String> = vec![];
    if !current.files.is_empty() {
        kinds.push(FILE_URL.to_string());
    }
    if current.text.is_some() {
        kinds.push(STRING.to_string());
    }
    if current.html.is_some() {
        kinds.push(HTML.to_string());
    }
    if current.image.is_some() {
        kinds.push(PNG.to_string());
    }

    let mut result = vec![];
    if wanted(FILE_URL, &kinds) {
        for path in &current.files {
            if let Ok(url) = tauri::Url::from_file_path(path) {
                result.push((FILE_URL.to_string(), url.as_str().as_bytes().to_vec()));
            }
        }
    }
    if let Some(text) = current.text.filter(|_| wanted(STRING, &kinds)) {
        result.push((STRING.to_string(), text.into_bytes()));
    }
    if let Some(html) = current.html.filter(|_| wanted(HTML, &kinds)) {
        result.push((HTML.to_string(), html.into_bytes()));
    }
    if let Some(image) = current.image.filter(|_| wanted(PNG, &kinds)) {
        if let Some(png) = png_from(&image) {
            result.push((PNG.to_string(), png));
        }
    }
    result
}

/// Replaces the clipboard contents and returns the new change count.
pub fn write(contents: &[Raw]) -> isize {
    let text_of = |kind: &str| {
        contents
            .iter()
            .find(|content| content.0 == kind)
            .map(|content| String::from_utf8_lossy(&content.1).into_owned())
    };
    let files: Vec<PathBuf> = contents
        .iter()
        .filter(|content| content.0 == FILE_URL)
        .filter_map(|content| tauri::Url::parse(&String::from_utf8_lossy(&content.1)).ok())
        .filter_map(|url| url.to_file_path().ok())
        .collect();
    let image = contents
        .iter()
        .find(|content| content.0 == PNG || content.0 == TIFF)
        .and_then(|content| image::load_from_memory(&content.1).ok())
        .map(|decoded| decoded.to_rgba8());

    with_clipboard(|clipboard| {
        let _ = if !files.is_empty() {
            clipboard.set().file_list(&files)
        } else if let Some(pixels) = image {
            clipboard.set_image(ImageData {
                width: pixels.width() as usize,
                height: pixels.height() as usize,
                bytes: Cow::Owned(pixels.into_raw()),
            })
        } else if let Some(html) = text_of(HTML) {
            clipboard.set_html(html, text_of(STRING))
        } else if let Some(text) = text_of(STRING) {
            clipboard.set_text(text)
        } else {
            Ok(())
        };
    });
    change_count()
}

pub fn clear() -> isize {
    with_clipboard(|clipboard| {
        let _ = clipboard.clear();
    });
    change_count()
}

#[cfg(windows)]
pub fn frontmost() -> Option<FrontApp> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };
    unsafe {
        let window = GetForegroundWindow();
        if window.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(window, &mut pid);
        if pid == 0 {
            return None;
        }
        let mut executable = None;
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if !process.is_null() {
            let mut buffer = [0u16; 1024];
            let mut length = buffer.len() as u32;
            if QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length) != 0 {
                let path = PathBuf::from(String::from_utf16_lossy(&buffer[..length as usize]));
                executable = Some(path);
            }
            CloseHandle(process);
        }
        let file_name = |path: &PathBuf| path.file_name().map(|n| n.to_string_lossy().into_owned());
        let stem = |path: &PathBuf| path.file_stem().map(|n| n.to_string_lossy().into_owned());
        Some(FrontApp {
            pid: pid as i32,
            bundle_id: executable.as_ref().and_then(file_name),
            name: executable.as_ref().and_then(stem),
        })
    }
}

/// Linux has no portable way to ask which app is in front (Wayland forbids it).
#[cfg(not(windows))]
pub fn frontmost() -> Option<FrontApp> {
    None
}

/// Hiding the popup already hands focus back to the previous window on these systems.
pub fn activate(_pid: i32) {}

/// Modifier keys held right now: (alt, shift).
#[cfg(windows)]
pub fn held_modifiers() -> (bool, bool) {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_MENU, VK_SHIFT};
    let down = |key: u16| unsafe { GetAsyncKeyState(key as i32) } < 0;
    (down(VK_MENU), down(VK_SHIFT))
}

#[cfg(not(windows))]
pub fn held_modifiers() -> (bool, bool) {
    (false, false)
}

/// Sending keystrokes needs no permission on these systems.
pub fn accessibility_trusted(_prompt: bool) -> bool {
    true
}

/// Sends Ctrl+V to the focused window, letting go of Alt and Shift first.
#[cfg(windows)]
pub fn paste() {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VK_CONTROL,
        VK_MENU, VK_SHIFT, VK_V,
    };
    let key = |code: u16, up: bool| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: code,
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { 0 },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let inputs = [
        key(VK_MENU, true),
        key(VK_SHIFT, true),
        key(VK_CONTROL, false),
        key(VK_V, false),
        key(VK_V, true),
        key(VK_CONTROL, true),
    ];
    unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        );
    }
}

/// Sends Ctrl+V to the focused window. Some Wayland compositors refuse synthetic input.
#[cfg(not(windows))]
pub fn paste() {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};
    let Ok(mut enigo) = Enigo::new(&Settings::default()) else {
        return;
    };
    let _ = enigo.key(Key::Alt, Direction::Release);
    let _ = enigo.key(Key::Shift, Direction::Release);
    let _ = enigo.key(Key::Control, Direction::Press);
    let _ = enigo.key(Key::Unicode('v'), Direction::Click);
    let _ = enigo.key(Key::Control, Direction::Release);
}
