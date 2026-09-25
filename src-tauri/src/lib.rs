use arboard::{Clipboard, ImageData};
use serde::Serialize;
use std::borrow::Cow;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
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

#[derive(Serialize)]
struct ClipboardImage {
    bytes: Vec<u8>,
    mime: String,
}

#[derive(Serialize)]
struct ClipboardSnapshot {
    kind: String,
    signature: String,
    text: Option<String>,
    bytes: Option<Vec<u8>>,
    mime: Option<String>,
}

fn clipboard_signature<T: Hash>(value: &T) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn read_clipboard_snapshot_inner() -> Result<ClipboardSnapshot, String> {
    let mut clipboard = Clipboard::new().map_err(|error| format!("连接系统剪贴板失败：{error}"))?;
    if let Ok(text) = clipboard.get_text() {
        if !text.is_empty() {
            return Ok(ClipboardSnapshot {
                signature: format!("text:{}", clipboard_signature(&text)),
                kind: "text".into(),
                text: Some(text),
                bytes: None,
                mime: None,
            });
        }
    }

    let image = clipboard.get_image().map_err(|error| format!("读取系统剪贴板失败：{error}"))?;
    let raw = image.bytes.into_owned();
    if raw.is_empty() || image.width == 0 || image.height == 0 {
        return Err("剪贴板里没有可读取的内容".into());
    }
    let rgba = image::RgbaImage::from_raw(image.width as u32, image.height as u32, raw.clone())
        .ok_or_else(|| "剪贴板图片格式无效".to_string())?;
    let mut encoded = Vec::new();
    image::DynamicImage::ImageRgba8(rgba)
        .write_to(&mut std::io::Cursor::new(&mut encoded), image::ImageFormat::Png)
        .map_err(|error| format!("编码剪贴板图片失败：{error}"))?;
    Ok(ClipboardSnapshot {
        signature: format!("image:{}", clipboard_signature(&raw)),
        kind: "image".into(),
        text: None,
        bytes: Some(encoded),
        mime: Some("image/png".into()),
    })
}

#[tauri::command]
fn read_clipboard_snapshot() -> Result<ClipboardSnapshot, String> {
    read_clipboard_snapshot_inner()
}

#[tauri::command]
fn read_clipboard_image() -> Result<ClipboardImage, String> {
    let snapshot = read_clipboard_snapshot_inner()?;
    if snapshot.kind != "image" {
        return Err("剪贴板里没有图片".into());
    }
    Ok(ClipboardImage {
        bytes: snapshot.bytes.unwrap_or_default(),
        mime: snapshot.mime.unwrap_or_else(|| "image/png".into()),
    })
}

#[tauri::command]
fn write_clipboard_snapshot(kind: String, text: Option<String>, bytes: Option<Vec<u8>>) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|error| format!("连接系统剪贴板失败：{error}"))?;
    match kind.as_str() {
        "text" => clipboard.set_text(text.unwrap_or_default()).map_err(|error| format!("写入系统剪贴板失败：{error}")),
        "image" => {
            let encoded = bytes.ok_or_else(|| "剪贴板图片数据为空".to_string())?;
            let rgba = image::load_from_memory(&encoded)
                .map_err(|error| format!("解析剪贴板图片失败：{error}"))?
                .to_rgba8();
            let (width, height) = rgba.dimensions();
            clipboard
                .set_image(ImageData { width: width as usize, height: height as usize, bytes: Cow::Owned(rgba.into_raw()) })
                .map_err(|error| format!("写入系统剪贴板失败：{error}"))
        }
        _ => Err("不支持的剪贴板内容类型".into()),
    }
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

#[derive(Serialize)]
struct RemoteImage {
    bytes: Vec<u8>,
    mime: String,
}

fn remote_image_referer(url: &reqwest::Url) -> Option<&'static str> {
    let host = url.host_str()?.to_ascii_lowercase();
    if host == "mmbiz.qpic.cn" {
        return Some("https://mp.weixin.qq.com/");
    }
    if host.ends_with(".xhscdn.com") || host == "ci.xiaohongshu.com" {
        return Some("https://www.xiaohongshu.com/");
    }
    None
}

#[tauri::command]
async fn read_remote_image(url: String) -> Result<RemoteImage, String> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|error| format!("图片地址无效：{error}"))?;
    let referer = remote_image_referer(&parsed).ok_or_else(|| "只允许读取公众号和小红书图片".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("只允许通过 HTTP 或 HTTPS 读取图片".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if remote_image_referer(attempt.url()).is_some() {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Mozilla/5.0 MoyueReader/0.1")
        .build()
        .map_err(|error| format!("创建图片请求失败：{error}"))?;
    let response = client
        .get(parsed)
        .header(reqwest::header::REFERER, referer)
        .header(reqwest::header::ACCEPT, "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8")
        .send()
        .await
        .map_err(|error| format!("下载图片失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("图片服务器返回 {}", response.status()));
    }
    if response.content_length().unwrap_or(0) > 20 * 1024 * 1024 {
        return Err("图片超过 20 MB，已跳过下载".into());
    }
    let mime = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(str::to_string);
    if let Some(value) = &mime {
        if !value.starts_with("image/") {
            return Err("远程地址没有返回图片".into());
        }
    }
    let mime = mime.unwrap_or_else(|| "image/jpeg".into());
    let bytes = response.bytes().await.map_err(|error| format!("读取图片失败：{error}"))?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("图片超过 20 MB，已跳过下载".into());
    }
    Ok(RemoteImage { bytes: bytes.to_vec(), mime })
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
        .invoke_handler(tauri::generate_handler![allow_asset_directory, read_local_image, read_clipboard_image, read_clipboard_snapshot, write_clipboard_snapshot, read_remote_image, open_directory, open_external_url])
        .run(tauri::generate_context!())
        .expect("error while running Moyue application");
}

#[cfg(test)]
mod tests {
    use super::{is_allowed_external_url, is_image, remote_image_referer};
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

    #[test]
    fn only_uses_platform_referers_for_remote_images() {
        assert_eq!(remote_image_referer(&reqwest::Url::parse("https://mmbiz.qpic.cn/a.png").unwrap()), Some("https://mp.weixin.qq.com/"));
        assert_eq!(remote_image_referer(&reqwest::Url::parse("https://sns-img-qc.xhscdn.com/a.png").unwrap()), Some("https://www.xiaohongshu.com/"));
        assert_eq!(remote_image_referer(&reqwest::Url::parse("https://example.com/a.png").unwrap()), None);
    }
}
