#!/bin/zsh

set -u
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR" || exit 1

echo "墨阅桌面端打包器"
echo "项目目录：$PROJECT_DIR"
echo

fail() {
  if [[ -n ${project_lock:-} ]]; then
    zsystem flock -u "$project_lock"
  fi
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

# 与启动器共用锁，避免 npm ci 清空正在使用的 node_modules。
if ! zmodload zsh/system || ! zsystem flock -t 0 -f project_lock package-lock.json; then
  echo "无法锁定项目。请确认桌面端和打包器均已退出，且 package-lock.json 可读写。"
  fail
fi

echo "正在按锁文件安装项目依赖..."
npm ci || fail

echo "正在生成 macOS .app/.dmg，请勿关闭此窗口..."
npm run package:macos || fail
zsystem flock -u "$project_lock"

OUTPUT_DIR="$PROJECT_DIR/src-tauri/target/release/bundle"
echo
echo "打包成功，产物目录：$OUTPUT_DIR"
open "$OUTPUT_DIR"
read -k 1 "?按任意键关闭此窗口..."
