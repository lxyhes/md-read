@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "DEV_PORT=1420"

echo 检查开发端口 %DEV_PORT%...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:"^ *TCP  *[^ ]*:%DEV_PORT%  *[^ ]*  *LISTENING "') do (
  echo 开发端口 %DEV_PORT% 已被进程 %%P 占用。请关闭该进程对应的开发窗口后重试。
  pause
  exit /b 1
)

echo 正在按锁文件安装项目依赖...
call npm.cmd ci
if not "%errorlevel%"=="0" (
  echo 依赖安装失败。
  pause
  exit /b 1
)

call npm.cmd run tauri dev
pause
