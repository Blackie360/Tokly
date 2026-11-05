use serde::Serialize;

pub const CATALOG: &[(&str, &str)] = &[
    ("com.microsoft.VSCode", "Visual Studio Code"),
    ("com.todesktop.230313mzl4w4u92", "Cursor"),
    ("dev.zed.Zed", "Zed"),
    ("com.apple.dt.Xcode", "Xcode"),
    ("com.sublimetext.4", "Sublime Text"),
    ("com.barebones.bbedit", "BBEdit"),
    ("com.panic.Nova", "Nova"),
    ("com.jetbrains.intellij", "IntelliJ IDEA"),
    ("com.jetbrains.intellij.ce", "IntelliJ IDEA Community"),
    ("com.jetbrains.WebStorm", "WebStorm"),
    ("com.jetbrains.pycharm", "PyCharm"),
    (
        "com.microsoft.VSCodeInsiders",
        "Visual Studio Code Insiders",
    ),
];

#[derive(Serialize)]
pub struct Editor {
    id: &'static str,
    name: &'static str,
}

pub fn installed_with(mut resolve: impl FnMut(&str) -> Option<String>) -> Vec<Editor> {
    CATALOG
        .iter()
        .filter_map(|&(id, name)| resolve(id).map(|_| Editor { id, name }))
        .collect()
}

#[cfg(target_os = "macos")]
pub fn resolve(id: &str) -> Option<String> {
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::NSString;
    let url = NSWorkspace::sharedWorkspace()
        .URLForApplicationWithBundleIdentifier(&NSString::from_str(id))?;
    let path = url.path()?.to_string();
    std::path::Path::new(&path).is_dir().then_some(path)
}

#[cfg(not(target_os = "macos"))]
pub fn resolve(_: &str) -> Option<String> {
    None
}

pub fn validate(preferred: &str) -> Result<(), String> {
    if preferred == "auto" || preferred == "finder" {
        return Ok(());
    }
    if !CATALOG.iter().any(|(id, _)| *id == preferred) || resolve(preferred).is_none() {
        return Err(
            "That editor is no longer installed. Refresh the editor list and choose another."
                .into(),
        );
    }
    Ok(())
}

// Resolve again at launch: apps may be moved or removed after Settings was opened.
// The launcher receives an app path and a project path as separate arguments.
pub fn open_with(
    preferred: &str,
    project: &str,
    mut resolve: impl FnMut(&str) -> Option<String>,
    mut launch: impl FnMut(Option<&str>, &str) -> bool,
) -> Result<String, String> {
    let selected = if preferred == "auto" {
        CATALOG
            .iter()
            .find_map(|&(id, name)| resolve(id).map(|path| (name, path)))
    } else {
        CATALOG
            .iter()
            .find(|(id, _)| *id == preferred)
            .and_then(|&(id, name)| resolve(id).map(|path| (name, path)))
    };
    if let Some((name, path)) = &selected {
        if launch(Some(path), project) {
            return Ok(format!("Opened in {name}"));
        }
    }
    if !launch(None, project) {
        return Err(
            "Could not open this project. Check the folder is accessible and try again.".into(),
        );
    }
    if preferred == "finder" || (preferred == "auto" && selected.is_none()) {
        Ok("Opened in Finder".into())
    } else {
        Ok("Your editor was unavailable or could not open the project. Opened in Finder instead; choose an editor in Settings.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lists_only_installed_apps_and_opens_the_selected_editor() {
        let resolve = |id: &str| (id == "dev.zed.Zed").then(|| "/Applications/Zed.app".to_string());
        let options = installed_with(resolve);
        assert_eq!(options.len(), 1);
        assert_eq!(options[0].name, "Zed");
        let result = open_with(
            "dev.zed.Zed",
            "/Projects/space and $name",
            resolve,
            |app, project| {
                assert_eq!(app, Some("/Applications/Zed.app"));
                assert_eq!(project, "/Projects/space and $name");
                true
            },
        )
        .unwrap();
        assert_eq!(result, "Opened in Zed");
    }
    #[test]
    fn removed_editor_and_failed_launch_fall_back_to_finder() {
        let mut calls = vec![];
        let result = open_with(
            "dev.zed.Zed",
            "/project",
            |_| None,
            |app, _| {
                calls.push(app.map(str::to_owned));
                true
            },
        )
        .unwrap();
        assert_eq!(calls, vec![None]);
        assert!(result.contains("Finder instead"));
        let mut calls = vec![];
        open_with(
            "dev.zed.Zed",
            "/project",
            |_| Some("/Zed.app".into()),
            |app, _| {
                calls.push(app.map(str::to_owned));
                app.is_none()
            },
        )
        .unwrap();
        assert_eq!(calls, vec![Some("/Zed.app".into()), None]);
    }
    #[test]
    fn automatic_selection_and_no_editor_fallback() {
        let result = open_with(
            "auto",
            "/project",
            |id| (id == "dev.zed.Zed").then(|| "/Zed.app".into()),
            |app, _| app == Some("/Zed.app"),
        )
        .unwrap();
        assert_eq!(result, "Opened in Zed");
        assert_eq!(
            open_with("auto", "/project", |_| None, |app, _| app.is_none()).unwrap(),
            "Opened in Finder"
        );
        assert!(open_with("finder", "/project", |_| None, |_, _| false).is_err());
        assert_eq!(open_with("unknown", "/project", |_| panic!("unknown ID must not be resolved"), |app,_| app.is_none()).unwrap(), "Your editor was unavailable or could not open the project. Opened in Finder instead; choose an editor in Settings.");
    }
}
