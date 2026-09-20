@echo off
set "EXE=%~dp0src-tauri\target\release\moyue-reader.exe"

if not exist "%EXE%" (
  echo 未找到桌面端程序：%EXE%
  pause
  exit /b 1
)

start "" "%EXE%"
