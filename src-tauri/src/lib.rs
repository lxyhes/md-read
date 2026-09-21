use std::path::Path;
use std::process::Command;
use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![allow_asset_directory, open_directory])
        .run(tauri::generate_context!())
        .expect("error while running Moyue application");
}
