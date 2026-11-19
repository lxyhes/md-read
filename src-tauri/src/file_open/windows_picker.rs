use super::MARKDOWN_EXTENSIONS;
use raw_window_handle::{
    DisplayHandle, HandleError, HasDisplayHandle, HasWindowHandle, RawWindowHandle,
    Win32WindowHandle, WindowHandle,
};
use std::io::Write;
use std::num::NonZeroIsize;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Output};
use std::sync::Mutex;
use tauri_plugin_dialog::FilePath;
use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;
use windows_sys::Win32::UI::WindowsAndMessaging::IsWindow;

const PICKER_FLAG: &str = "--moyue-pick-markdown";
static PICKER: Mutex<()> = Mutex::new(());

struct DialogOwner(Win32WindowHandle);

impl HasWindowHandle for DialogOwner {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        // The calling reader window owns the modal picker until this child exits.
        Ok(unsafe { WindowHandle::borrow_raw(RawWindowHandle::Win32(self.0)) })
    }
}

impl HasDisplayHandle for DialogOwner {
    fn display_handle(&self) -> Result<DisplayHandle<'_>, HandleError> {
        Ok(DisplayHandle::windows())
    }
}

pub fn run_picker_child() -> Option<i32> {
    let mut args = std::env::args_os().skip(1);
    if args.next()?.as_os_str() != PICKER_FLAG {
        return None;
    }
    let hwnd = args
        .next()
        .and_then(|arg| arg.to_str()?.parse::<NonZeroIsize>().ok());
    let Some(hwnd) = hwnd.filter(|hwnd| unsafe { IsWindow(hwnd.get() as _) != 0 }) else {
        return Some(1);
    };
    let owner = DialogOwner(Win32WindowHandle::new(hwnd));
    let paths = rfd::FileDialog::new()
        .set_parent(&owner)
        .add_filter("Markdown / Quarto", MARKDOWN_EXTENSIONS)
        .pick_files()
        .unwrap_or_default();
    let mut stdout = std::io::stdout().lock();
    let sent = serde_json::to_writer(&mut stdout, &paths).is_ok() && stdout.flush().is_ok();
    Some(i32::from(!sent))
}

pub(super) fn pick_files(window: &tauri::Window) -> Result<Vec<FilePath>, String> {
    let _picker = PICKER.try_lock().map_err(|_| "文件选择器已经打开")?;
    if !window.is_enabled().map_err(|error| error.to_string())? {
        return Err("请先关闭当前对话框".into());
    }
    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0 as isize;
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    // Windows shell extensions run inside their host and can terminate the picker.
    let output = Command::new(exe)
        .arg(PICKER_FLAG)
        .arg(hwnd.to_string())
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| format!("无法启动文件选择器：{error}"))?;
    if !output.status.success() {
        // A crashed modal dialog may leave its owner disabled.
        let _ = window.set_enabled(true);
        let _ = window.set_focus();
    }
    picker_paths(output)
}

fn picker_paths(output: Output) -> Result<Vec<FilePath>, String> {
    if !output.status.success() {
        return Err(format!(
            "Windows 文件选择器异常退出（{}），可将 Markdown 文件拖入窗口",
            output.status
        ));
    }
    let paths: Vec<PathBuf> = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("无法读取文件选择结果：{error}"))?;
    Ok(paths.into_iter().map(FilePath::Path).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::windows::process::ExitStatusExt;
    use std::process::ExitStatus;

    #[test]
    fn picker_output_preserves_paths_and_handles_cancellation_and_crashes() {
        let output = |status, stdout: &str| Output {
            status: ExitStatus::from_raw(status),
            stdout: stdout.as_bytes().to_vec(),
            stderr: Vec::new(),
        };
        let files = picker_paths(output(
            0,
            r#"["C:\\资料\\测试 文档.MD","C:\\资料\\文档.qmd"]"#,
        ))
        .unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(
            files[0].as_path(),
            Some(std::path::Path::new(r"C:\资料\测试 文档.MD"))
        );
        assert!(picker_paths(output(0, "[]")).unwrap().is_empty());
        assert!(picker_paths(output(0xc0000374, ""))
            .unwrap_err()
            .contains("异常退出"));
    }
}
