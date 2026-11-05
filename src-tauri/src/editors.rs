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
#[serde(rename_all = "camelCase")]
pub struct Editor {
    id: &'static str,
    name: &'static str,
    icon_data_url: Option<String>,
}

pub fn installed_with(
    mut resolve: impl FnMut(&str) -> Option<String>,
    mut icon: impl FnMut(&str) -> Option<String>,
) -> Vec<Editor> {
    CATALOG
        .iter()
        .filter_map(|&(id, name)| {
            resolve(id).map(|path| Editor {
                id,
                name,
                icon_data_url: icon(&path),
            })
        })
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

// Use the installed bundle's own icon, exactly as macOS presents it. No web
// downloads or bundled approximations; a missing icon must not hide the editor.
#[cfg(target_os = "macos")]
pub fn app_icon(path: &str) -> Option<String> {
    use objc2::AllocAnyThread;
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSCalibratedRGBColorSpace, NSCompositingOperation,
        NSGraphicsContext, NSWorkspace,
    };
    use objc2_foundation::{
        NSDataBase64EncodingOptions, NSDictionary, NSPoint, NSRect, NSSize, NSString,
    };
    if !std::path::Path::new(path).is_dir() {
        return None;
    }
    objc2::rc::autoreleasepool(|_| {
        let image = NSWorkspace::sharedWorkspace().iconForFile(&NSString::from_str(path));
        // Rasterize at 2x the displayed size instead of exporting a potentially
        // megabyte-sized 1024px icon representation.
        let bitmap = unsafe {
            NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel(
            NSBitmapImageRep::alloc(), std::ptr::null_mut(), 48,48,8,4,true,false,NSCalibratedRGBColorSpace,0,0
        )
        }?;
        let context = NSGraphicsContext::graphicsContextWithBitmapImageRep(&bitmap)?;
        NSGraphicsContext::saveGraphicsState_class();
        NSGraphicsContext::setCurrentContext(Some(&context));
        image.drawInRect_fromRect_operation_fraction(
            NSRect::new(NSPoint::new(0., 0.), NSSize::new(48., 48.)),
            NSRect::new(NSPoint::new(0., 0.), NSSize::new(0., 0.)),
            NSCompositingOperation::Copy,
            1.,
        );
        NSGraphicsContext::restoreGraphicsState_class();
        // Empty properties contain no incorrectly typed encoding options.
        let png = unsafe {
            bitmap.representationUsingType_properties(
                NSBitmapImageFileType::PNG,
                &NSDictionary::new(),
            )
        }?;
        if png.length() > 256 * 1024 {
            return None;
        }
        Some(format!(
            "data:image/png;base64,{}",
            png.base64EncodedStringWithOptions(NSDataBase64EncodingOptions::empty())
        ))
    })
}
#[cfg(not(target_os = "macos"))]
pub fn app_icon(_: &str) -> Option<String> {
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
        let options = installed_with(resolve, |_| None);
        assert!(options[0].icon_data_url.is_none());
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
    #[cfg(target_os = "macos")]
    #[test]
    fn reads_installed_app_icon_as_png_and_handles_missing_bundle() {
        let icon = app_icon("/System/Library/CoreServices/Finder.app").expect("macOS Finder icon");
        assert!(icon.starts_with("data:image/png;base64,iVBOR"));
        assert!(icon.len() < 20_000);
        for id in ["com.microsoft.VSCode", "com.todesktop.230313mzl4w4u92"] {
            if let Some(path) = resolve(id) {
                assert!(
                    app_icon(&path).is_some(),
                    "Installed editor icon should render: {id}"
                );
            }
        }
        assert!(app_icon("/not-installed/Tokly-test-editor.app").is_none());
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
