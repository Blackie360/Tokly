use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub hotkey: String,
    pub launch_at_login: bool,
    pub search_mode: String,
    pub paste_by_default: bool,
    pub remove_formatting_by_default: bool,

    pub history_size: usize,
    pub sort_by: String,
    pub save_text: bool,
    pub save_images: bool,
    pub save_files: bool,
    /// Add screenshots that macOS saves to disk to the history.
    pub capture_screenshots: bool,

    pub popup_position: String,
    pub pin_to: String,
    pub image_max_height: u32,
    pub show_search: bool,
    pub show_footer: bool,
    pub show_special_symbols: bool,
    pub show_hex_color_swatch: bool,
    pub highlight_match: String,
    pub show_recent_copy_in_menu_bar: bool,

    pub ignored_apps: Vec<String>,
    pub ignore_all_apps_except_listed: bool,
    pub ignored_pasteboard_types: Vec<String>,
    pub ignored_regexps: Vec<String>,

    pub clipboard_check_interval: f64,
    pub ignore_events: bool,
    pub ignore_only_next_event: bool,
    pub clear_on_quit: bool,
    pub clear_system_clipboard: bool,
    pub suppress_clear_alert: bool,
}

/// ⇧⌘C on macOS. Elsewhere Ctrl+Shift+C is taken by terminals and browsers, so Alt+Shift+C.
#[cfg(target_os = "macos")]
pub const DEFAULT_HOTKEY: &str = "Command+Shift+C";
#[cfg(not(target_os = "macos"))]
pub const DEFAULT_HOTKEY: &str = "Alt+Shift+C";

pub fn default_ignored_types() -> Vec<String> {
    [
        "Pasteboard generator type",
        "com.agilebits.onepassword",
        "com.typeit4me.clipping",
        "de.petermaurer.TransientPasteboardType",
        "net.antelle.keeweb",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            hotkey: DEFAULT_HOTKEY.into(),
            launch_at_login: false,
            search_mode: "exact".into(),
            paste_by_default: false,
            remove_formatting_by_default: false,
            history_size: 200,
            sort_by: "lastCopiedAt".into(),
            save_text: true,
            save_images: true,
            save_files: true,
            capture_screenshots: true,
            popup_position: "cursor".into(),
            pin_to: "top".into(),
            image_max_height: 40,
            show_search: true,
            show_footer: true,
            show_special_symbols: true,
            show_hex_color_swatch: true,
            highlight_match: "bold".into(),
            show_recent_copy_in_menu_bar: false,
            ignored_apps: vec![],
            ignore_all_apps_except_listed: false,
            ignored_pasteboard_types: default_ignored_types(),
            ignored_regexps: vec![],
            clipboard_check_interval: 0.5,
            ignore_events: false,
            ignore_only_next_event: false,
            clear_on_quit: false,
            clear_system_clipboard: false,
            suppress_clear_alert: false,
        }
    }
}

impl Settings {
    pub fn load(path: &Path) -> Settings {
        std::fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(bytes) = serde_json::to_vec_pretty(self) {
            let _ = std::fs::write(path, bytes);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("tokly-settings-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn missing_or_broken_file_gives_defaults() {
        let dir = temp();
        let path = dir.join("settings.json");
        assert_eq!(Settings::load(&path).hotkey, DEFAULT_HOTKEY);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&path, b"{ not json").unwrap();
        let loaded = Settings::load(&path);
        assert_eq!(loaded.history_size, 200);
        assert_eq!(loaded.ignored_pasteboard_types, default_ignored_types());
    }

    #[test]
    fn saves_and_reloads_in_a_new_folder() {
        let path = temp().join("nested").join("settings.json");
        let settings = Settings {
            history_size: 42,
            ignored_apps: vec!["com.example.Vault".into()],
            ..Settings::default()
        };
        settings.save(&path);
        let loaded = Settings::load(&path);
        assert_eq!(loaded.history_size, 42);
        assert_eq!(loaded.ignored_apps, vec!["com.example.Vault".to_string()]);
    }

    #[test]
    fn older_files_keep_their_values_and_gain_new_defaults() {
        let dir = temp();
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(&path, br#"{"historySize": 7, "noLongerUsed": true}"#).unwrap();
        let loaded = Settings::load(&path);
        assert_eq!(loaded.history_size, 7);
        assert!(loaded.capture_screenshots);
        assert_eq!(loaded.search_mode, "exact");
    }
}
