@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "RUSTUP_HOME=%~dp0.rustup-task"
set "CARGO_HOME=%~dp0.cargo-task"
set "DEV_PORT=1420"
set "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--disable-http-cache"

echo 检查开发端口 %DEV_PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr 1420 ^| findstr LISTENING') do (
  echo 结束占用端口 %DEV_PORT% 的进程 PID %%P...
  taskkill /F /PID %%P >nul 2>&1
)

if exist "node_modules\.vite" (
  echo 清理 Vite 依赖缓存...
  rmdir /s /q "node_modules\.vite"
)

npm run tauri dev
pause
