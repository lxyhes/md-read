use std::{ffi::c_void, sync::atomic::{AtomicPtr, Ordering}};

use block2::Block;
use objc2::{msg_send, rc::Retained, runtime::{AnyObject, Imp, Sel}, sel};
use objc2_web_kit::{WKFrameInfo, WKMediaCaptureType, WKPermissionDecision, WKSecurityOrigin};
use tauri::Manager;

static READER_WEBVIEW: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

unsafe extern "C-unwind" fn decide(
    _delegate: &AnyObject,
    _selector: Sel,
    webview: *mut c_void,
    _origin: &WKSecurityOrigin,
    frame: &WKFrameInfo,
    kind: WKMediaCaptureType,
    handler: &Block<dyn Fn(WKPermissionDecision)>,
) {
    let reader = READER_WEBVIEW.load(Ordering::Acquire);
    let from_reader = !reader.is_null() && webview == reader && unsafe { frame.isMainFrame() };
    handler.call((if from_reader && kind == WKMediaCaptureType::Microphone {
        WKPermissionDecision::Prompt
    } else {
        WKPermissionDecision::Deny
    },));
}

pub fn ready() -> bool {
    !READER_WEBVIEW.load(Ordering::Acquire).is_null()
}

pub fn install(app: &tauri::App) {
    let Some(view) = app.get_webview("main") else { return; };
    let _ = view.with_webview(|webview| {
        let view = webview.inner();
        // SAFETY: the platform handle is a live WKWebView on its owning thread.
        let delegate: Option<Retained<AnyObject>> = unsafe { msg_send![view.cast::<AnyObject>(), UIDelegate] };
        let Some(delegate) = delegate else { return; };
        let Some(method) = delegate.class().instance_method(sel!(webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:)) else { return; };
        // Wry 0.55 grants media capture to every WebView. Only replace that exact delegate method.
        unsafe { method.set_implementation(std::mem::transmute::<*const (), Imp>(decide as *const ())) };
        READER_WEBVIEW.store(view, Ordering::Release);
    });
}
