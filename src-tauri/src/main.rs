#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{
    path::Path,
    sync::{Arc, Mutex},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, State,
};
use tokly_tracker::{Snapshot, Store};
type Shared = Arc<Mutex<Store>>;
fn locked(s: &Shared) -> Result<std::sync::MutexGuard<'_, Store>, String> {
    s.lock()
        .map_err(|_| "Tracking state unavailable. Restart Tokly.".into())
}
async fn with_store<T: Send + 'static>(
    shared: Shared,
    op: impl FnOnce(&mut Store) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = locked(&shared)?;
        op(&mut state)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn confirm_action(message: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        matches!(
            rfd::MessageDialog::new()
                .set_title("Tokly")
                .set_description(message)
                .set_level(rfd::MessageLevel::Warning)
                .set_buttons(rfd::MessageButtons::OkCancel)
                .show(),
            rfd::MessageDialogResult::Ok
        )
    })
    .await
    .map_err(|e| e.to_string())
}
#[tauri::command]
async fn snapshot(s: State<'_, Shared>) -> Result<Snapshot, String> {
    with_store(s.inner().clone(), |s| s.snapshot()).await
}
#[tauri::command]
async fn add_root(s: State<'_, Shared>) -> Result<bool, String> {
    let path = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("Choose a workspace folder for Tokly to track")
            .pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Some(path) = path {
        with_store(s.inner().clone(), move |s| {
            s.add_root(&path)?;
            s.reconcile()?;
            Ok(true)
        })
        .await
    } else {
        Ok(false)
    }
}
#[tauri::command]
async fn remove_root(path: String, s: State<'_, Shared>) -> Result<(), String> {
    with_store(s.inner().clone(), move |s| s.remove_root(&path)).await
}
#[tauri::command]
async fn save_note(id: String, note: String, s: State<'_, Shared>) -> Result<(), String> {
    with_store(s.inner().clone(), move |s| s.save_note(&id, &note)).await
}
#[tauri::command]
async fn exclude_project(id: String, excluded: bool, s: State<'_, Shared>) -> Result<(), String> {
    with_store(s.inner().clone(), move |s| s.exclude(&id, excluded)).await
}
#[tauri::command]
async fn set_retention(days: i64, s: State<'_, Shared>) -> Result<(), String> {
    with_store(s.inner().clone(), move |s| s.set_retention(days)).await
}
#[tauri::command]
async fn rescan(s: State<'_, Shared>) -> Result<(), String> {
    with_store(s.inner().clone(), |s| s.reconcile()).await
}
#[tauri::command]
async fn open_project(id: String, editor: bool, s: State<'_, Shared>) -> Result<(), String> {
    with_store(s.inner().clone(), move |s| {
        if !s
            .snapshot()?
            .projects
            .iter()
            .any(|p| p.id == id && p.available)
            || !Path::new(&id).is_dir()
        {
            return Err("Project folder is unavailable.".into());
        }
        // Fixed executable and separate arguments, never a shell command.
        #[cfg(target_os = "macos")]
        {
            let mut command = std::process::Command::new("/usr/bin/open");
            if editor {
                command.args(["-a", "Cursor"]);
            }
            command.arg(&id);
            if !command
                .output()
                .map_err(|e| e.to_string())?
                .status
                .success()
            {
                return Err(if editor {
                    "Cursor could not open this project. Install Cursor or use Open folder."
                } else {
                    "Finder could not open this folder."
                }
                .into());
            }
            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (id, editor);
            Err("Opening projects is currently supported on macOS.".into())
        }
    })
    .await
}
fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| show(app)))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .macos_launcher(tauri_plugin_autostart::MacosLauncher::LaunchAgent)
                .build(),
        )
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let store = Store::open(&dir.join("tokly.db")).map_err(std::io::Error::other)?;
            let shared = Arc::new(Mutex::new(store));
            app.manage(tokly_tracker::start(shared.clone()));
            app.manage(shared);
            let open = MenuItem::with_id(app, "open", "Open Tokly", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Tokly", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("Bundled app icon").clone())
                .tooltip("Tokly — local project tracking")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            confirm_action,
            snapshot,
            add_root,
            remove_root,
            save_note,
            exclude_project,
            set_retention,
            rescan,
            open_project
        ])
        .build(tauri::generate_context!())
        .expect("Could not start Tokly")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                show(app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
