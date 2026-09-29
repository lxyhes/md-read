use arboard::{Clipboard, ImageData};
#[cfg(target_os = "macos")]
use objc2_app_kit::NSPasteboard;
use serde::Serialize;
use std::borrow::Cow;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::net::IpAddr;
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::Manager;
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::DataExchange::GetClipboardSequenceNumber;

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

#[derive(Serialize)]
struct ClipboardSignature {
    kind: String,
    signature: String,
}

fn clipboard_signature<T: Hash>(value: &T) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn text_clipboard_signature(text: &str) -> String {
    let head: String = text.chars().take(256).collect();
    let tail: String = text.chars().rev().take(256).collect::<String>().chars().rev().collect();
    clipboard_signature(&(text.len(), head, tail))
}

fn image_clipboard_signature(width: usize, height: usize, bytes: &[u8]) -> String {
    let head = &bytes[..bytes.len().min(4096)];
    let tail_start = bytes.len().saturating_sub(4096);
    clipboard_signature(&(width, height, bytes.len(), head, &bytes[tail_start..]))
}

#[cfg(target_os = "macos")]
fn platform_clipboard_marker() -> Option<String> {
    Some(format!("macos-change:{}", NSPasteboard::generalPasteboard().changeCount()))
}

#[cfg(target_os = "windows")]
fn platform_clipboard_marker() -> Option<String> {
    Some(format!("windows-sequence:{}", unsafe { GetClipboardSequenceNumber() }))
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn platform_clipboard_marker() -> Option<String> {
    None
}

fn read_clipboard_snapshot_inner() -> Result<ClipboardSnapshot, String> {
    let mut clipboard = Clipboard::new().map_err(|error| format!("连接系统剪贴板失败：{error}"))?;
    if let Ok(text) = clipboard.get_text() {
        if !text.is_empty() {
            return Ok(ClipboardSnapshot {
                signature: format!("text:{}", text_clipboard_signature(&text)),
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
        signature: format!("image:{}", image_clipboard_signature(image.width, image.height, &raw)),
        kind: "image".into(),
        text: None,
        bytes: Some(encoded),
        mime: Some("image/png".into()),
    })
}

fn read_clipboard_signature_inner() -> Result<Option<ClipboardSignature>, String> {
    if let Some(marker) = platform_clipboard_marker() {
        return Ok(Some(ClipboardSignature {
            kind: "system".into(),
            signature: marker,
        }));
    }

    let mut clipboard = Clipboard::new().map_err(|error| format!("连接系统剪贴板失败：{error}"))?;
    if let Ok(text) = clipboard.get_text() {
        if !text.is_empty() {
            return Ok(Some(ClipboardSignature {
                kind: "text".into(),
                signature: format!("text:{}", text_clipboard_signature(&text)),
            }));
        }
    }

    let image = match clipboard.get_image() {
        Ok(image) => image,
        Err(_) => return Ok(None),
    };
    let bytes = image.bytes.into_owned();
    if bytes.is_empty() || image.width == 0 || image.height == 0 {
        return Ok(None);
    }
    Ok(Some(ClipboardSignature {
        kind: "image".into(),
        signature: format!("image:{}", image_clipboard_signature(image.width, image.height, &bytes)),
    }))
}

#[tauri::command]
fn read_clipboard_snapshot() -> Result<Option<ClipboardSnapshot>, String> {
    Ok(read_clipboard_snapshot_inner().ok())
}

#[tauri::command]
fn read_clipboard_signature() -> Result<Option<ClipboardSignature>, String> {
    read_clipboard_signature_inner()
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

fn is_safe_remote_image_url(url: &reqwest::Url) -> bool {
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    let Some(host) = url.host_str() else { return false };
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".local") {
        return false;
    }
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => !(ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified()),
        Ok(IpAddr::V6(ip)) => !(ip.is_loopback() || ip.is_unspecified() || ip.is_unique_local()),
        Err(_) => true,
    }
}

#[tauri::command]
async fn download_remote_image(url: String) -> Result<RemoteImage, String> {
    let parsed = reqwest::Url::parse(url.trim()).map_err(|error| format!("图片地址无效：{error}"))?;
    if !is_safe_remote_image_url(&parsed) {
        return Err("只允许下载公开 HTTP 或 HTTPS 图片".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if is_safe_remote_image_url(attempt.url()) { attempt.follow() } else { attempt.stop() }
        }))
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("Mozilla/5.0 MoyueReader/0.1")
        .build()
        .map_err(|error| format!("创建图片请求失败：{error}"))?;
    let response = client.get(parsed).send().await.map_err(|error| format!("下载图片失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("图片服务器返回 {}", response.status()));
    }
    if response.content_length().unwrap_or(0) > 20 * 1024 * 1024 {
        return Err("图片超过 20 MB，已跳过下载".into());
    }
    let mime = response.headers().get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok()).and_then(|value| value.split(';').next())
        .unwrap_or("image/jpeg").to_string();
    if !mime.starts_with("image/") {
        return Err("远程地址没有返回图片".into());
    }
    let bytes = response.bytes().await.map_err(|error| format!("读取图片失败：{error}"))?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("图片超过 20 MB，已跳过下载".into());
    }
    Ok(RemoteImage { bytes: bytes.to_vec(), mime })
}

#[tauri::command]
async fn upload_piclist_image(path: String, endpoint: String, key: Option<String>) -> Result<String, String> {
    let image = Path::new(&path);
    if !image.is_file() || !is_image(image) {
        return Err("请选择受支持的图片文件".into());
    }
    let mut url = reqwest::Url::parse(endpoint.trim()).map_err(|error| format!("PicList 地址无效：{error}"))?;
    let host = url.host_str().unwrap_or_default();
    if !matches!(url.scheme(), "http" | "https") || !matches!(host, "127.0.0.1" | "localhost" | "::1") {
        return Err("PicList 服务地址必须指向本机".into());
    }
    if let Some(value) = key.filter(|value| !value.trim().is_empty()) {
        url.query_pairs_mut().append_pair("key", value.trim());
    }
    let bytes = std::fs::read(image).map_err(|error| format!("读取图片失败：{error}"))?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("图片超过 20 MB，已取消上传".into());
    }
    let filename = image.file_name().and_then(|value| value.to_str()).unwrap_or("image.png");
    let boundary = format!("moyue-{}", clipboard_signature(&(filename, bytes.len())));
    let mut body = format!("--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n").into_bytes();
    body.extend_from_slice(&bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    let response = reqwest::Client::builder().timeout(std::time::Duration::from_secs(60)).build()
        .map_err(|error| format!("创建 PicList 请求失败：{error}"))?
        .post(url).header(reqwest::header::CONTENT_TYPE, format!("multipart/form-data; boundary={boundary}"))
        .body(body).send().await.map_err(|error| format!("连接 PicList 失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("PicList 返回 {}", response.status()));
    }
    let response_text = response.text().await.map_err(|error| format!("读取 PicList 响应失败：{error}"))?;
    let payload: serde_json::Value = serde_json::from_str(&response_text).map_err(|error| format!("PicList 响应无效：{error}"))?;
    payload.get("result").and_then(|value| value.as_array()).and_then(|items| items.first()).and_then(|value| value.as_str())
        .map(str::to_string).ok_or_else(|| payload.get("message").and_then(|value| value.as_str()).unwrap_or("PicList 没有返回图片地址").to_string())
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

fn pandoc_import_extension(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()).map(str::to_ascii_lowercase).as_deref(),
        Some("docx" | "odt" | "rtf" | "epub" | "tex" | "latex" | "ltx" | "rst" | "rest" | "org" | "wiki" | "dokuwiki" | "textile" | "opml")
    )
}

fn pandoc_export_format(format: &str) -> Option<(&'static str, &'static str)> {
    match format {
        "odt" => Some(("odt", "odt")),
        "rtf" => Some(("rtf", "rtf")),
        "mediawiki" => Some(("mediawiki", "wiki")),
        _ => None,
    }
}

fn pandoc_error(error: std::io::Error) -> String {
    if error.kind() == std::io::ErrorKind::NotFound {
        "未检测到 Pandoc。请安装 Pandoc 后重试；墨阅不会自动安装系统软件。".into()
    } else {
        format!("启动 Pandoc 失败：{error}")
    }
}

fn pandoc_failure(output: std::process::Output) -> Result<(), String> {
    if output.status.success() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if detail.is_empty() { "Pandoc 转换失败".into() } else { format!("Pandoc 转换失败：{detail}") })
}

#[tauri::command]
fn pandoc_import_document(source_path: String, target_path: String) -> Result<(), String> {
    let source = Path::new(&source_path);
    let target = Path::new(&target_path);
    if !source.is_file() || !pandoc_import_extension(source) {
        return Err("请选择受支持的 DOCX、ODT、RTF、EPUB、LaTeX 或其他 Pandoc 文档".into());
    }
    if !matches!(target.extension().and_then(|value| value.to_str()).map(str::to_ascii_lowercase).as_deref(), Some("md" | "markdown")) {
        return Err("导入目标必须是 Markdown 文件".into());
    }
    let parent = target.parent().filter(|path| path.is_dir()).ok_or("目标目录不存在")?;
    let target_name = target.file_name().ok_or("目标文件名无效")?;
    let stem = target.file_stem().and_then(|value| value.to_str()).unwrap_or("document");
    let media_directory = format!(".moyue-assets/{stem}-media");
    std::fs::create_dir_all(parent.join(".moyue-assets")).map_err(|error| format!("创建媒体目录失败：{error}"))?;

    let output = Command::new("pandoc")
        .current_dir(parent)
        .arg(source)
        .args(["--to", "gfm+footnotes+task_lists", "--wrap=none", "--extract-media"])
        .arg(media_directory)
        .arg("--output")
        .arg(target_name)
        .output()
        .map_err(pandoc_error)?;
    pandoc_failure(output)
}

#[tauri::command]
fn pandoc_export_document(source: String, target_path: String, format: String, resource_path: Option<String>) -> Result<(), String> {
    let (writer, extension) = pandoc_export_format(&format).ok_or("不支持的 Pandoc 导出格式")?;
    let target = Path::new(&target_path);
    if target.extension().and_then(|value| value.to_str()).map(str::to_ascii_lowercase).as_deref() != Some(extension) {
        return Err(format!("导出目标必须使用 .{extension} 扩展名"));
    }
    let parent = target.parent().filter(|path| path.is_dir()).ok_or("目标目录不存在")?;
    let working_directory = resource_path.as_deref().map(Path::new).filter(|path| path.is_dir()).unwrap_or(parent);
    let mut child = Command::new("pandoc")
        .current_dir(working_directory)
        .args(["--from", "gfm+footnotes+task_lists", "--to", writer, "--wrap=none", "--output"])
        .arg(target)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(pandoc_error)?;
    child.stdin.take().ok_or("无法向 Pandoc 写入文档")?.write_all(source.as_bytes()).map_err(|error| format!("写入 Pandoc 失败：{error}"))?;
    pandoc_failure(child.wait_with_output().map_err(|error| format!("等待 Pandoc 失败：{error}"))?)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![allow_asset_directory, read_local_image, read_clipboard_image, read_clipboard_snapshot, read_clipboard_signature, write_clipboard_snapshot, read_remote_image, download_remote_image, upload_piclist_image, open_directory, open_external_url, pandoc_import_document, pandoc_export_document])
        .run(tauri::generate_context!())
        .expect("error while running Moyue application");
}

#[cfg(test)]
mod tests {
    use super::{is_allowed_external_url, is_image, is_safe_remote_image_url, pandoc_export_format, pandoc_import_extension, remote_image_referer};
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

    #[test]
    fn remote_image_download_rejects_local_networks() {
        assert!(is_safe_remote_image_url(&reqwest::Url::parse("https://example.com/a.png").unwrap()));
        assert!(!is_safe_remote_image_url(&reqwest::Url::parse("http://127.0.0.1/a.png").unwrap()));
        assert!(!is_safe_remote_image_url(&reqwest::Url::parse("http://192.168.1.2/a.png").unwrap()));
    }

    #[test]
    fn pandoc_import_only_accepts_document_formats() {
        assert!(pandoc_import_extension(Path::new("book.EPUB")));
        assert!(pandoc_import_extension(Path::new("draft.docx")));
        assert!(!pandoc_import_extension(Path::new("script.exe")));
    }

    #[test]
    fn pandoc_export_formats_are_fixed() {
        assert_eq!(pandoc_export_format("mediawiki"), Some(("mediawiki", "wiki")));
        assert_eq!(pandoc_export_format("odt"), Some(("odt", "odt")));
        assert_eq!(pandoc_export_format("html"), None);
    }
}
