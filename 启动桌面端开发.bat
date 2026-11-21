@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "DEV_PORT=1420"

echo 正在按锁文件安装项目依赖...
call npm.cmd ci
if errorlevel 1 (
  echo 依赖安装失败。
  pause
  exit /b 1
)

echo 检查开发端口 %DEV_PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr 1420 ^| findstr LISTENING') do (
  echo 结束占用端口 %DEV_PORT% 的进程 PID %%P...
  taskkill /F /PID %%P >nul 2>&1
)

call npm.cmd run tauri dev
pause
