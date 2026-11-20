#!/usr/bin/env bash
set -e
trap 'echo "打包失败，请查看上方错误信息。" >&2' ERR

cd -- "$(dirname -- "$0")"

echo "墨阅 Linux 桌面端打包器"
echo "项目目录：$PWD"

if [[ $(uname -s) != Linux ]]; then
  echo "请在 Linux 或 WSL 的 Bash 中运行此脚本。" >&2
  exit 1
fi

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo "请先安装 Linux 版 Node.js 22.12+ 和 npm。" >&2
  exit 1
fi

if ! command -v cargo >/dev/null; then
  echo "请先安装 Rust stable，并确保 cargo 在 PATH 中。" >&2
  exit 1
fi

if ! command -v pkg-config >/dev/null || ! pkg-config --exists webkit2gtk-4.1; then
  echo "缺少 pkg-config 或 WebKitGTK 4.1 开发库，请按 README 安装 Linux 打包依赖。" >&2
  exit 1
fi

echo "正在安装项目依赖..."
npm ci

echo "正在生成 Linux .deb 和 AppImage..."
npm run package:linux

echo "打包成功。默认产物目录：$PWD/src-tauri/target/release/bundle/"
