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

if [[ ! -d "node_modules" ]]; then
  echo "首次启动，正在安装项目依赖..."
  npm install || {
    echo
    echo "依赖安装失败。"
    read -k 1 "?按任意键退出..."
    exit 1
  }
fi

echo "正在启动 Tauri 桌面端，关闭窗口或按 Ctrl+C 可停止开发服务。"
echo
npm run tauri dev

EXIT_CODE=$?
echo
echo "桌面端已退出，退出码：$EXIT_CODE"
read -k 1 "?按任意键关闭此窗口..."
exit $EXIT_CODE
