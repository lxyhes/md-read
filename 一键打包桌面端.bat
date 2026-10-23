@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo 墨阅桌面端打包器
echo 项目目录：%CD%
echo.

where node >nul 2>&1 || goto :missing_node
where npm >nul 2>&1 || goto :missing_node
where cargo >nul 2>&1 || goto :missing_rust

if not exist "node_modules" (
  echo 首次打包，正在安装项目依赖...
  call npm ci
  if errorlevel 1 goto :failed
)

echo 正在生成 Windows .exe，请勿关闭此窗口...
call npm run package:windows
if errorlevel 1 goto :failed

set "OUTPUT_DIR=%~dp0src-tauri\target\release\bundle\nsis"
echo.
echo 打包成功，产物目录：%OUTPUT_DIR%
if exist "%OUTPUT_DIR%" start "" explorer "%OUTPUT_DIR%"
pause
exit /b 0

:missing_node
echo 错误：未找到 Node.js/npm，请先安装 Node.js 20+。
goto :failed

:missing_rust
echo 错误：未找到 Rust/cargo，请先安装 Rust stable。
goto :failed

:failed
echo.
echo 打包失败，请查看上方错误信息。
pause
exit /b 1
