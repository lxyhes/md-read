@echo off
chcp 65001 >nul
setlocal DisableDelayedExpansion
cd /d "%~dp0" || goto :failed

set "PROJECT_DIR=%CD%"
set "BUNDLE_DIR=%PROJECT_DIR%\src-tauri\target\release\bundle"
set "BUILD_IMAGE=moyue-linux-build:bookworm"

echo 墨阅 Linux 桌面端打包器
where docker.exe >nul 2>&1
if errorlevel 1 goto :missing_docker
set "DOCKER_OS="
for /f %%I in ('docker info --format "{{.OSType}}" 2^>nul') do set "DOCKER_OS=%%I"
if /i not "%DOCKER_OS%"=="linux" goto :missing_docker

docker image inspect "%BUILD_IMAGE%" >nul 2>&1
if errorlevel 1 (
  echo 正在准备 Debian 构建镜像，首次运行需要下载依赖...
  docker build --platform linux/amd64 --tag "%BUILD_IMAGE%" - < "%PROJECT_DIR%\scripts\Dockerfile.linux"
  if errorlevel 1 goto :failed
)

if not exist "%BUNDLE_DIR%\deb\" (
  mkdir "%BUNDLE_DIR%\deb" || goto :failed
)
if not exist "%BUNDLE_DIR%\appimage\" (
  mkdir "%BUNDLE_DIR%\appimage" || goto :failed
)

docker run --rm --platform linux/amd64 --env CARGO_BUILD_JOBS=3 ^
  --mount "type=bind,source=%PROJECT_DIR%,target=/source,readonly" ^
  --mount "type=bind,source=%BUNDLE_DIR%\deb,target=/deb-out" ^
  --mount "type=bind,source=%BUNDLE_DIR%\appimage,target=/appimage-out" ^
  "%BUILD_IMAGE%" bash /source/scripts/package-linux-docker.sh
if errorlevel 1 goto :failed

echo.
echo 打包成功，产物目录："%BUNDLE_DIR%"
pause
exit /b 0

:missing_docker
echo 请先启动 Docker Desktop，并切换到 Linux 容器。
goto :failed

:failed
echo.
echo 打包失败，请查看上方错误信息。
pause
exit /b 1
