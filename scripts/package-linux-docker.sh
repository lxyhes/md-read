#!/usr/bin/env bash
set -euo pipefail

mkdir -p /work/moyue
tar -C /source --exclude=./.git --exclude=./.idea --exclude=./.rustup-task \
  --exclude=./node_modules --exclude=./dist --exclude=./src-tauri/target -cf - . |
  tar -C /work/moyue -xf -
cd /work/moyue

bash ./一键打包桌面端.sh

shopt -s nullglob
bundle=src-tauri/target/release/bundle
deb=("$bundle"/deb/*.deb)
appimage=("$bundle"/appimage/*.AppImage)
if (( ${#deb[@]} != 1 || ${#appimage[@]} != 1 )); then
  echo "打包结果缺少 .deb 或 AppImage，或产物数量异常。" >&2
  exit 1
fi

[[ $(dpkg-deb -f "${deb[0]}" Architecture) == amd64 ]]
offset=$("${appimage[0]}" --appimage-offset)
test "$offset" -gt 0

cp -- "${deb[0]}" /deb-out/
cp -- "${appimage[0]}" /appimage-out/
