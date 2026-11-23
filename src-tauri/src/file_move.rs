use std::{fs, io, path::Path};

#[tauri::command]
pub(crate) fn move_path_without_overwrite(path: String, next_path: String) -> Result<(), String> {
    let source = Path::new(&path);
    let destination = Path::new(&next_path);
    if !source.is_absolute()
        || !destination.is_absolute()
        || source.file_name().is_none()
        || destination.file_name().is_none()
    {
        return Err("请使用有效的系统文件路径".into());
    }
    rename_without_overwrite(source, destination).map_err(|error| match error.kind() {
        io::ErrorKind::AlreadyExists => "目标文件夹中已存在同名条目，未覆盖".into(),
        _ => format!("无法移动到 {next_path}：{error}"),
    })
}

#[tauri::command]
pub(crate) fn move_markdown_with_assets(
    path: String,
    next_path: String,
    expected_source: String,
    next_source: String,
    asset_folder: String,
    assets: Vec<String>,
) -> Result<(), String> {
    let original = Path::new(&path);
    let destination = Path::new(&next_path);
    let is_markdown = |file: &Path| {
        file.is_absolute()
            && matches!(
                file.extension().and_then(|ext| ext.to_str()).map(str::to_ascii_lowercase).as_deref(),
                Some("md" | "markdown" | "qmd")
            )
    };
    if !is_markdown(original)
        || !is_markdown(destination)
        || !asset_folder.starts_with("moved-")
        || !asset_folder.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err("请使用有效的 Markdown 文件和资源目录".into());
    }
    if !fs::symlink_metadata(original).map_err(|error| error.to_string())?.is_file() {
        return Err("只有普通 Markdown 文件可以在移动时更新图片路径".into());
    }
    let disk = fs::read_to_string(original).map_err(|error| format!("读取原文档失败：{error}"))?;
    if disk.strip_prefix('\u{feff}').unwrap_or(&disk) != expected_source {
        return Err("文档已被其他程序修改，请重新移动".into());
    }
    let next_source = if disk.starts_with('\u{feff}') { format!("\u{feff}{next_source}") } else { next_source };

    let mut published_assets = None;
    if !assets.is_empty() {
        let source_dir = original.parent().unwrap().canonicalize().map_err(|error| error.to_string())?;
        let destination_dir = destination.parent().unwrap().canonicalize().map_err(|error| error.to_string())?;
        let assets_dir = destination_dir.join(".moyue-assets");
        fs::create_dir_all(&assets_dir).map_err(|error| format!("无法创建图片目录：{error}"))?;
        let resolved_assets = assets_dir.canonicalize().map_err(|error| error.to_string())?;
        if resolved_assets.parent() != Some(&destination_dir)
            || !resolved_assets
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.eq_ignore_ascii_case(".moyue-assets"))
        {
            return Err("目标图片目录是链接，移动已取消".into());
        }
        let staged = tempfile::tempdir_in(&assets_dir).map_err(|error| error.to_string())?;
        for (index, asset) in assets.iter().enumerate() {
            let source = Path::new(asset);
            let resolved = source.canonicalize().map_err(|error| format!("无法读取图片 {asset}：{error}"))?;
            if !resolved.starts_with(&source_dir) || !resolved.is_file() {
                return Err(format!("图片不在原文档目录内：{asset}"));
            }
            let name = source.file_name().and_then(|part| part.to_str()).ok_or("无效的图片文件名")?;
            fs::copy(&resolved, staged.path().join(format!("{}-{name}", index + 1)))
                .map_err(|error| format!("无法复制图片 {asset}：{error}"))?;
        }
        let published = assets_dir.join(asset_folder);
        rename_without_overwrite(staged.path(), &published).map_err(|error| format!("无法保存图片：{error}"))?;
        published_assets = Some(published);
    }

    let result = match move_path_without_overwrite(path.clone(), next_path.clone()) {
        Ok(()) => match super::write_markdown_checked(next_path.clone(), next_source, Some(disk)) {
            Ok(()) => Ok(()),
            Err(error) => {
                if let Err(rollback) = move_path_without_overwrite(next_path.clone(), path) {
                    return Err(format!("文档位于 {next_path}，更新图片路径失败：{error}。恢复原位置失败：{rollback}"));
                }
                Err(error)
            }
        },
        Err(error) => Err(error),
    };
    if result.is_err() {
        if let Some(directory) = published_assets {
            let _ = fs::remove_dir_all(directory);
        }
    }
    result
}

#[cfg(windows)]
fn rename_without_overwrite(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::MoveFileExW;

    let source: Vec<u16> = source.as_os_str().encode_wide().chain([0]).collect();
    let destination: Vec<u16> = destination.as_os_str().encode_wide().chain([0]).collect();
    if source[..source.len() - 1].contains(&0) || destination[..destination.len() - 1].contains(&0) {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    if unsafe { MoveFileExW(source.as_ptr(), destination.as_ptr(), 0) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(unix)]
fn rename_without_overwrite(source: &Path, destination: &Path) -> io::Result<()> {
    use rustix::fs::{renameat_with, RenameFlags, CWD};

    Ok(renameat_with(CWD, source, CWD, destination, RenameFlags::NOREPLACE)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copies_shared_images_only_when_the_document_can_move() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("目标");
        fs::create_dir(&folder).unwrap();
        let source = root.path().join("文档.md");
        let destination = folder.join("文档.md");
        let image = root.path().join("封面.png");
        let asset = folder.join(".moyue-assets/moved-test/1-封面.png");
        fs::write(&source, "\u{feff}![封面](封面.png)\r\n").unwrap();
        fs::write(&image, b"image").unwrap();
        fs::write(&destination, "同名").unwrap();
        let move_file = || {
            move_markdown_with_assets(
                source.to_string_lossy().into_owned(),
                destination.to_string_lossy().into_owned(),
                "![封面](封面.png)\r\n".into(),
                "![封面](.moyue-assets/moved-test/1-封面.png)\r\n".into(),
                "moved-test".into(),
                vec![image.to_string_lossy().into_owned()],
            )
        };

        assert!(move_file().is_err());
        assert!(source.exists());
        assert_eq!(fs::read_to_string(&destination).unwrap(), "同名");
        assert!(!asset.exists());

        fs::remove_file(&destination).unwrap();
        move_file().unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read(&image).unwrap(), b"image");
        assert_eq!(fs::read(&asset).unwrap(), b"image");
        assert_eq!(
            fs::read_to_string(destination).unwrap(),
            "\u{feff}![封面](.moyue-assets/moved-test/1-封面.png)\r\n"
        );
    }

    #[test]
    fn moves_file_only_when_destination_is_free() {
        let root = tempfile::tempdir().unwrap();
        let folder = root.path().join("目标");
        fs::create_dir(&folder).unwrap();
        let source = root.path().join("文档.md");
        let destination = folder.join("文档.md");
        fs::write(&source, "原文").unwrap();
        fs::write(&destination, "同名").unwrap();
        let move_file = || {
            move_path_without_overwrite(
                source.to_string_lossy().replace('\\', "/"),
                destination.to_string_lossy().replace('\\', "/"),
            )
        };

        assert_eq!(
            move_file().unwrap_err(),
            "目标文件夹中已存在同名条目，未覆盖"
        );
        assert_eq!(fs::read_to_string(&source).unwrap(), "原文");
        assert_eq!(fs::read_to_string(&destination).unwrap(), "同名");

        fs::remove_file(&destination).unwrap();
        move_file().unwrap();
        assert!(!source.exists());
        assert_eq!(fs::read_to_string(&destination).unwrap(), "原文");
    }
}
