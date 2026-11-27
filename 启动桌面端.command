#!/bin/zsh

# 允许从 Finder 双击启动：先切换到脚本所在的项目目录。
set -u

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR" || exit 1

echo "墨阅桌面端启动器"
echo "项目目录：$PROJECT_DIR"
echo

if ! command -v npm >/dev/null 2>&1; then
  echo "错误：未找到 npm，请先安装 Node.js： https://nodejs.org/"
  read -k 1 "?按任意键退出..."
  exit 1
fi

# 与打包器共用锁，避免 npm ci 清空正在使用的 node_modules。
if ! zmodload zsh/system || ! zsystem flock -t 0 -f project_lock package-lock.json; then
  echo "无法锁定项目。请确认桌面端和打包器均已退出，且 package-lock.json 可读写。"
  read -k 1 "?按任意键退出..."
  exit 1
fi

echo "正在按锁文件安装项目依赖..."
npm ci || {
  zsystem flock -u "$project_lock"
  echo
  echo "依赖安装失败。"
  read -k 1 "?按任意键退出..."
  exit 1
}

echo "正在构建最新前端资源..."
npm run build || {
  zsystem flock -u "$project_lock"
  echo
  echo "构建失败，已停止启动，避免使用旧版本。"
  read -k 1 "?按任意键退出..."
  exit 1
}

echo "正在启动 Tauri 桌面端，关闭窗口或按 Ctrl+C 可停止开发服务。"
echo
npm run tauri dev

EXIT_CODE=$?
zsystem flock -u "$project_lock"
echo
echo "桌面端已退出，退出码：$EXIT_CODE"
read -k 1 "?按任意键关闭此窗口..."
exit $EXIT_CODE
