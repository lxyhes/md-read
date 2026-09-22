use std::path::Path;
use std::process::Command;
use tauri::Manager;

fn is_image(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()).map(str::to_ascii_lowercase).as_deref(),
        Some("avif" | "bmp" | "gif" | "jpg" | "jpeg" | "png" | "svg" | "webp")
    )
}

#[tauri::command]
fn read_local_image(path: String) -> Result<tauri::ipc::Response, String> {
    let image = Path::new(&path);
    if !image.is_file() || !is_image(image) {
        return Err(format!("图片不存在或格式不受支持：{path}"));
    }
    std::fs::read(image)
        .map(tauri::ipc::Response::new)
        .map_err(|error| format!("读取图片失败：{error}"))
}

#[tauri::command]
fn allow_asset_directory(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let directory = Path::new(&path);
    if !directory.is_dir() {
        return Err(format!("图片目录不存在：{path}"));
    }

    app.asset_protocol_scope()
        .allow_directory(directory, true)
        .map_err(|error| format!("授权图片目录失败：{error}"))
}

#[tauri::command]
fn open_directory(path: String) -> Result<(), String> {
    let directory = Path::new(&path);
    if !directory.is_dir() {
        return Err(format!("目录不存在：{path}"));
    }

    #[cfg(target_os = "windows")]
    let result = Command::new("explorer.exe").arg(directory).spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(directory).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(directory).spawn();

    result.map(|_| ()).map_err(|error| format!("打开目录失败：{error}"))
}

fn is_allowed_external_url(url: &str) -> bool {
    let normalized = url.trim().to_ascii_lowercase();
    normalized.starts_with("https://")
        || normalized.starts_with("http://")
        || normalized.starts_with("mailto:")
        || normalized.starts_with("tel:")
        || normalized.starts_with("//")
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let value = url.trim();
    if !is_allowed_external_url(value) {
        return Err("仅支持 http、https、mailto、tel 链接".into());
    }

    #[cfg(target_os = "windows")]
    let result = Command::new("explorer.exe").arg(value).spawn();
    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(value).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(value).spawn();

    result.map(|_| ()).map_err(|error| format!("打开链接失败：{error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![allow_asset_directory, read_local_image, open_directory, open_external_url])
        .run(tauri::generate_context!())
        .expect("error while running Moyue application");
}

#[cfg(test)]
mod tests {
    use super::{is_allowed_external_url, is_image};
    use std::path::Path;

    #[test]
    fn only_reads_images() {
        assert!(is_image(Path::new("cover.PNG")));
        assert!(!is_image(Path::new("notes.md")));
    }

    #[test]
    fn only_opens_safe_external_urls() {
        assert!(is_allowed_external_url("https://example.com/read"));
        assert!(is_allowed_external_url("mailto:hello@example.com"));
        assert!(!is_allowed_external_url("javascript:alert(1)"));
        assert!(!is_allowed_external_url("C:/notes/readme.md"));
    }
}
