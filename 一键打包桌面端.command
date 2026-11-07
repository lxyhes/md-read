#!/bin/zsh

set -u
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR" || exit 1

echo "墨阅桌面端打包器"
echo "项目目录：$PROJECT_DIR"
echo

fail() {
  echo
  echo "打包失败，请查看上方错误信息。"
  read -k 1 "?按任意键关闭此窗口..."
  exit 1
}

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "错误：未找到 Node.js/npm，请先安装 Node.js 20+。"
  fail
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "错误：未找到 Rust/cargo，请先安装 Rust stable。"
  fail
fi

if [[ ! -d "node_modules" ]]; then
  echo "首次打包，正在安装项目依赖..."
  npm ci || fail
fi

echo "正在生成 macOS .app/.dmg，请勿关闭此窗口..."
npm run package:macos || fail

OUTPUT_DIR="$PROJECT_DIR/src-tauri/target/release/bundle"
echo
echo "打包成功，产物目录：$OUTPUT_DIR"
open "$OUTPUT_DIR"
read -k 1 "?按任意键关闭此窗口..."
