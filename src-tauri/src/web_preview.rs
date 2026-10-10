use serde::Deserialize;
use tauri::{Emitter, Manager, WebviewBuilder, WebviewUrl};

const LABEL: &str = "link-preview";

#[derive(Deserialize)]
pub struct Bounds { x: f64, y: f64, width: f64, height: f64 }

impl Bounds {
    fn rect(&self) -> Result<tauri::Rect, String> {
        if [self.x, self.y, self.width, self.height].iter().any(|v| !v.is_finite())
            || self.x < 0.0 || self.y < 0.0 || self.width <= 0.0 || self.height <= 0.0 {
            return Err("网页预览区域无效".into());
        }
        Ok(tauri::Rect {
            position: tauri::LogicalPosition::new(self.x, self.y).into(),
            size: tauri::LogicalSize::new(self.width, self.height).into(),
        })
    }
}

fn preview_url(value: &str) -> Result<tauri::Url, String> {
    let url = tauri::Url::parse(value.trim()).map_err(|_| "网页地址无效")?;
    if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() || url.password().is_some() {
        return Err("预览仅支持不含账号密码的 http、https 网页".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn web_preview(app: tauri::AppHandle, webview: tauri::Webview, action: String, url: Option<String>, bounds: Option<Bounds>) -> Result<(), String> {
    // Remote pages must never be able to control the reader or create other webviews.
    if webview.label() != "main" { return Err("仅阅读器可控制网页预览".into()); }
    let result = match action.as_str() {
        "close" => app.get_webview(LABEL).map(|view| view.close()).unwrap_or(Ok(())),
        "resize" => {
            let rect = bounds.ok_or("缺少网页预览区域")?.rect()?;
            app.get_webview(LABEL).map(|view| view.set_bounds(rect)).unwrap_or(Ok(()))
        }
        "back" | "reload" => {
            let view = app.get_webview(LABEL).ok_or("网页预览未打开")?;
            view.eval(if action == "back" { "history.back()" } else { "location.reload()" })
        }
        "open" => {
            let target = preview_url(url.as_deref().ok_or("缺少网页地址")?)?;
            let rect = bounds.ok_or("缺少网页预览区域")?.rect()?;
            if let Some(view) = app.get_webview(LABEL) {
                view.set_bounds(rect).map_err(|error| error.to_string())?;
                view.navigate(target)
            } else {
                let title_app = app.clone();
                let load_app = app.clone();
                let popup_app = app.clone();
                let builder = WebviewBuilder::new(LABEL, WebviewUrl::External(target))
                    .on_navigation(|url| preview_url(url.as_str()).is_ok())
                    .on_document_title_changed(move |_, title| {
                        let _ = title_app.emit_to("main", "web-preview-update", serde_json::json!({"title": title}));
                    })
                    .on_page_load(move |_, payload| {
                        let loading = matches!(payload.event(), tauri::webview::PageLoadEvent::Started);
                        let _ = load_app.emit_to("main", "web-preview-update", serde_json::json!({"url": payload.url().as_str(), "loading": loading}));
                    })
                    .on_new_window(move |url, _| {
                        if preview_url(url.as_str()).is_ok() {
                            let _ = popup_app.emit_to("main", "web-preview-popup", url.as_str());
                        }
                        tauri::webview::NewWindowResponse::Deny
                    });
                app.get_window("main").ok_or("阅读器窗口未打开")?
                    .add_child(builder, rect.position, rect.size).map(|_| ())
            }
        }
        _ => return Err("未知网页预览操作".into()),
    };
    result.map_err(|error| format!("网页预览失败：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_video_timestamps_and_rejects_privileged_schemes() {
        let url = "https://b.quark.cn/apps/course?debug=0&fid=example#?seek_t=3778";
        assert_eq!(preview_url(url).unwrap().as_str(), url);
        for invalid in ["file:///C:/secret.txt", "javascript:alert(1)", "tauri://localhost", "https://user:pass@example.com/"] {
            assert!(preview_url(invalid).is_err());
        }
    }
    #[test]
    fn validates_native_view_bounds() {
        assert!(Bounds { x: 600.0, y: 90.0, width: 600.0, height: 720.0 }.rect().is_ok());
        assert!(Bounds { x: 0.0, y: 0.0, width: f64::NAN, height: 1.0 }.rect().is_err());
        assert!(Bounds { x: 0.0, y: 0.0, width: 0.0, height: 1.0 }.rect().is_err());
    }
}
