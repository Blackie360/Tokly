//! Thin bridge to the macOS pasteboard, workspace and event APIs.
//! Pasteboard and workspace calls are made from the main thread.

use crate::history::{Raw, FILE_URL};
use objc2::rc::autoreleasepool;
use objc2::runtime::AnyObject;
use objc2::{class, msg_send};
use std::ffi::{c_char, c_void, CStr, CString};

type Id = *mut AnyObject;

unsafe fn ns_string(s: &str) -> Id {
    let c = CString::new(s.replace('\0', "")).unwrap_or_default();
    msg_send![class!(NSString), stringWithUTF8String: c.as_ptr()]
}

unsafe fn to_string(ns: Id) -> Option<String> {
    if ns.is_null() {
        return None;
    }
    let ptr: *const c_char = msg_send![ns, UTF8String];
    if ptr.is_null() {
        return None;
    }
    Some(CStr::from_ptr(ptr).to_string_lossy().into_owned())
}

unsafe fn to_bytes(data: Id) -> Option<Vec<u8>> {
    if data.is_null() {
        return None;
    }
    let len: usize = msg_send![data, length];
    if len == 0 {
        return None;
    }
    let ptr: *const c_void = msg_send![data, bytes];
    if ptr.is_null() {
        return None;
    }
    Some(std::slice::from_raw_parts(ptr as *const u8, len).to_vec())
}

unsafe fn ns_data(bytes: &[u8]) -> Id {
    msg_send![class!(NSData), dataWithBytes: bytes.as_ptr() as *const c_void, length: bytes.len()]
}

unsafe fn array_items(array: Id) -> Vec<Id> {
    if array.is_null() {
        return vec![];
    }
    let count: usize = msg_send![array, count];
    (0..count).map(|i| msg_send![array, objectAtIndex: i]).collect()
}

unsafe fn pasteboard() -> Id {
    msg_send![class!(NSPasteboard), generalPasteboard]
}

pub fn change_count() -> isize {
    autoreleasepool(|_| unsafe { msg_send![pasteboard(), changeCount] })
}

/// Every type currently declared on the pasteboard.
pub fn pasteboard_types() -> Vec<String> {
    autoreleasepool(|_| unsafe {
        let types: Id = msg_send![pasteboard(), types];
        array_items(types).into_iter().filter_map(|t| to_string(t)).collect()
    })
}

/// Reads the wanted types of every pasteboard item, in pasteboard order.
pub fn read(wanted: impl Fn(&str, &[String]) -> bool) -> Vec<Raw> {
    autoreleasepool(|_| unsafe {
        let mut result = vec![];
        let items: Id = msg_send![pasteboard(), pasteboardItems];
        for item in array_items(items) {
            let type_objects: Id = msg_send![item, types];
            let type_objects = array_items(type_objects);
            let names: Vec<String> = type_objects.iter().filter_map(|t| to_string(*t)).collect();
            for (object, name) in type_objects.iter().zip(names.iter()) {
                if !wanted(name, &names) {
                    continue;
                }
                let data: Id = msg_send![item, dataForType: *object];
                if let Some(bytes) = to_bytes(data) {
                    result.push((name.clone(), bytes));
                }
            }
        }
        result
    })
}

/// Replaces the pasteboard contents and returns the new change count.
pub fn write(contents: &[Raw]) -> isize {
    autoreleasepool(|_| unsafe {
        let pb = pasteboard();
        let _: isize = msg_send![pb, clearContents];

        let urls: Id = msg_send![class!(NSMutableArray), array];
        for (_, data) in contents.iter().filter(|c| c.0 == FILE_URL) {
            let url: Id = msg_send![class!(NSURL), URLWithString: ns_string(&String::from_utf8_lossy(data))];
            if !url.is_null() {
                let _: () = msg_send![urls, addObject: url];
            }
        }
        let url_count: usize = msg_send![urls, count];
        if url_count > 0 {
            let _: bool = msg_send![pb, writeObjects: urls];
        }

        let others: Vec<&Raw> = contents.iter().filter(|c| c.0 != FILE_URL).collect();
        if !others.is_empty() {
            let types: Id = msg_send![class!(NSMutableArray), array];
            for (kind, _) in &others {
                let _: () = msg_send![types, addObject: ns_string(kind)];
            }
            let owner: Id = std::ptr::null_mut();
            let _: isize = msg_send![pb, addTypes: types, owner: owner];
            for (kind, data) in &others {
                let _: bool = msg_send![pb, setData: ns_data(data), forType: ns_string(kind)];
            }
        }
        msg_send![pb, changeCount]
    })
}

pub fn clear() -> isize {
    autoreleasepool(|_| unsafe {
        let pb = pasteboard();
        let _: isize = msg_send![pb, clearContents];
        msg_send![pb, changeCount]
    })
}

pub struct FrontApp {
    pub pid: i32,
    pub bundle_id: Option<String>,
    pub name: Option<String>,
}

pub fn frontmost() -> Option<FrontApp> {
    autoreleasepool(|_| unsafe {
        let workspace: Id = msg_send![class!(NSWorkspace), sharedWorkspace];
        let app: Id = msg_send![workspace, frontmostApplication];
        if app.is_null() {
            return None;
        }
        let pid: i32 = msg_send![app, processIdentifier];
        let bundle_id: Id = msg_send![app, bundleIdentifier];
        let name: Id = msg_send![app, localizedName];
        Some(FrontApp { pid, bundle_id: to_string(bundle_id), name: to_string(name) })
    })
}

/// Gives keyboard focus back to another app.
pub fn activate(pid: i32) {
    autoreleasepool(|_| unsafe {
        let app: Id = msg_send![class!(NSRunningApplication), runningApplicationWithProcessIdentifier: pid];
        if !app.is_null() {
            let _: bool = msg_send![app, activateWithOptions: 0usize];
        }
    })
}

/// Modifier keys held right now: (option, shift).
pub fn held_modifiers() -> (bool, bool) {
    let flags: usize = unsafe { msg_send![class!(NSEvent), modifierFlags] };
    (flags & (1 << 19) != 0, flags & (1 << 17) != 0)
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceCreate(state: i32) -> *mut c_void;
    fn CGEventCreateKeyboardEvent(source: *mut c_void, key: u16, down: bool) -> *mut c_void;
    fn CGEventSetFlags(event: *mut c_void, flags: u64);
    fn CGEventPost(tap: u32, event: *mut c_void);
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(object: *const c_void);
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
    static kAXTrustedCheckOptionPrompt: *const c_void;
}

/// Whether the app may post keystrokes. With `prompt`, macOS offers to open the
/// Accessibility settings when it may not.
pub fn accessibility_trusted(prompt: bool) -> bool {
    autoreleasepool(|_| unsafe {
        let yes: Id = msg_send![class!(NSNumber), numberWithBool: prompt];
        let key = kAXTrustedCheckOptionPrompt as Id;
        let options: Id = msg_send![class!(NSDictionary), dictionaryWithObject: yes, forKey: key];
        AXIsProcessTrustedWithOptions(options as *const c_void)
    })
}

/// Sends ⌘V to the frontmost app.
pub fn paste() {
    const COMBINED_SESSION_STATE: i32 = 0;
    const SESSION_EVENT_TAP: u32 = 1;
    const COMMAND: u64 = 1 << 20;
    const KEY_V: u16 = 9;
    unsafe {
        let source = CGEventSourceCreate(COMBINED_SESSION_STATE);
        for down in [true, false] {
            let event = CGEventCreateKeyboardEvent(source, KEY_V, down);
            if !event.is_null() {
                CGEventSetFlags(event, COMMAND);
                CGEventPost(SESSION_EVENT_TAP, event);
                CFRelease(event);
            }
        }
        if !source.is_null() {
            CFRelease(source);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::history::{RTF, STRING};

    /// Replaces the real clipboard while it runs (and puts it back), so it is opt-in:
    /// `cargo test -- --ignored`
    #[test]
    #[ignore]
    fn pasteboard_round_trip() {
        let original = read(|_, _| true);

        let rich = vec![
            (STRING.to_string(), b"plain".to_vec()),
            (RTF.to_string(), b"{\\rtf1 plain}".to_vec()),
        ];
        let before = change_count();
        let after = write(&rich);
        assert!(after > before);
        assert_eq!(change_count(), after);
        let back = read(|kind, _| kind == STRING || kind == RTF);
        assert_eq!(back.len(), 2);
        assert!(rich.iter().all(|content| back.contains(content)));
        assert!(pasteboard_types().iter().any(|t| t == RTF));

        let files = vec![
            (FILE_URL.to_string(), b"file:///tmp/".to_vec()),
            (FILE_URL.to_string(), b"file:///usr/".to_vec()),
        ];
        write(&files);
        let back = read(|kind, _| kind == FILE_URL);
        assert_eq!(back, files);

        if original.is_empty() {
            clear();
        } else {
            write(&original);
        }
    }
}
