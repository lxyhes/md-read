use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Default)]
pub struct PendingFileOpens(Mutex<Vec<String>>);

pub fn markdown_paths(paths: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<String> {
    paths.into_iter().filter_map(|value| {
        if value.starts_with('-') { return None; }
        let path = PathBuf::from(value);
        let extension = path.extension()?.to_str()?;
        if !["md", "markdown", "qmd"].iter().any(|ext| extension.eq_ignore_ascii_case(ext)) {
            return None;
        }
        let path = if path.is_absolute() { path } else { cwd.join(path) };
        if path.is_dir() { return None; }
        Some(path.to_string_lossy().into_owned())
    }).collect()
}

pub fn queue_files(app: &tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() { return; }
    {
        let state = app.state::<PendingFileOpens>();
        let mut pending = state.0.lock().unwrap_or_else(|error| error.into_inner());
        for path in paths {
            if !pending.contains(&path) { pending.push(path); }
        }
    }
    // Keep paths until the frontend is ready; the event only wakes the consumer.
    if let Err(error) = app.emit("native-open-files", ()) {
        eprintln!("无法通知前端打开文档：{error}");
    }
}

pub fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn take_open_files(state: tauri::State<PendingFileOpens>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap_or_else(|error| error.into_inner()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_markdown_paths_with_spaces_unicode_and_uppercase_extensions() {
        let directory = tempfile::tempdir().unwrap();
        let absolute = directory.path().join("绝对 路径.md");
        let paths = markdown_paths(vec!["中文 文档.MD".into(), "notes.markdown".into(), "book.qmd".into(), absolute.to_string_lossy().into_owned()], directory.path());
        assert_eq!(paths, vec![directory.path().join("中文 文档.MD"), directory.path().join("notes.markdown"), directory.path().join("book.qmd"), absolute].into_iter().map(|path| path.to_string_lossy().into_owned()).collect::<Vec<_>>());
    }

    #[test]
    fn ignores_flags_other_extensions_and_directories() {
        let directory = tempfile::tempdir().unwrap();
        std::fs::create_dir(directory.path().join("folder.md")).unwrap();
        assert!(markdown_paths(vec!["--inspect.md".into(), "app.exe".into(), "image.png".into(), "folder.md".into()], directory.path()).is_empty());
    }
}
