#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod editors;
mod note_export;
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
type GraphState = Arc<Mutex<tokly_tracker::graph::GraphCache>>;
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
async fn git_graph(id: String, offset: usize, generation: Option<String>, force: bool, s: State<'_, Shared>, graph: State<'_, GraphState>) -> Result<tokly_tracker::graph::Page, String> {
    let project = with_store(s.inner().clone(), move |s| {
        if !s.snapshot()?.projects.iter().any(|p| p.id == id && p.available && !p.excluded) {
            return Err("Project is unavailable or excluded.".into());
        }
        let canonical = Path::new(&id).canonicalize().map_err(|e| e.to_string())?;
        if !s.roots()?.iter().any(|root| canonical.starts_with(root)) {
            return Err("Project is outside approved workspace folders. Rescan your workspaces.".into());
        }
        Ok(id)
    }).await?;
    let cache = graph.inner().clone();
    tauri::async_runtime::spawn_blocking(move || cache.lock().map_err(|_| "Graph unavailable. Restart Tokly.".to_string())?.page(Path::new(&project),offset,generation.as_deref(),force)).await.map_err(|e|e.to_string())?
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
async fn export_notes(drafts: Vec<tokly_tracker::notes::Draft>, s: State<'_, Shared>) -> Result<bool,String> {
    let backup=with_store(s.inner().clone(), move |s|s.notes_backup(drafts)).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(path)=rfd::FileDialog::new().set_title("Export Tokly notes — contains local paths and note text").set_file_name("Tokly-notes.json").add_filter("JSON backup", &["json"]).save_file() else {return Ok(false)};
        note_export::write_atomic(&path,&backup)?;Ok(true)
    }).await.map_err(|e|e.to_string())?
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
async fn pin_project(id: String, pinned: bool, s: State<'_, Shared>) -> Result<(), String> {
    with_store(s.inner().clone(), move |s| s.pin_project(&id, pinned)).await
}
#[tauri::command]
async fn set_history_days(days: i64, s: State<'_, Shared>) -> Result<(), String> {
    with_store(s.inner().clone(), move |s| s.set_history_days(days)).await
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
async fn installed_editors() -> Result<Vec<editors::Editor>, String> {
    tauri::async_runtime::spawn_blocking(|| editors::installed_with(editors::resolve, editors::app_icon))
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn set_preferred_editor(editor: String, s: State<'_, Shared>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || editors::validate(&editor).map(|_| editor))
        .await
        .map_err(|e| e.to_string())?
        .and_then(|editor| locked(s.inner())?.set_preferred_editor(&editor))
}
#[tauri::command]
async fn open_project(id: String, editor: bool, editor_id: Option<String>, s: State<'_, Shared>) -> Result<String, String> {
    let preferred = with_store(s.inner().clone(), move |s| {
        if !s
            .snapshot()?
            .projects
            .iter()
            .any(|p| p.id == id && p.available)
            || !Path::new(&id).is_dir()
        {
            return Err("Project folder is unavailable.".into());
        }
        Ok((
            id,
            if editor {
                editor_id.unwrap_or_else(|| s.preferred_editor())
            } else {
                "finder".into()
            },
        ))
    })
    .await?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            editors::open_with(
                &preferred.1,
                &preferred.0,
                editors::resolve,
                |app, project| {
                    let mut command = std::process::Command::new("/usr/bin/open");
                    if let Some(path) = app {
                        command.args(["-a", path]);
                    } else {
                        command.args(["-b", "com.apple.finder"]);
                    }
                    command
                        .arg(project)
                        .output()
                        .map(|o| o.status.success())
                        .unwrap_or(false)
                },
            )
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = preferred;
            Err("Opening projects is currently supported on macOS.".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
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
            app.manage(Arc::new(Mutex::new(tokly_tracker::graph::GraphCache::default())));
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
            git_graph,
            add_root,
            remove_root,
            save_note,
            export_notes,
            exclude_project,
            set_retention,
            set_history_days,
            pin_project,
            rescan,
            open_project,
            installed_editors,
            set_preferred_editor
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
