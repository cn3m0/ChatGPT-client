#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
appimage_path="${repo_root}/dist/ChatGPT-1.0.1.AppImage"
icon_path="${repo_root}/build/icons/icon.png"
applications_dir="${XDG_DATA_HOME:-${HOME}/.local/share}/applications"
desktop_file="${applications_dir}/chatgpt-poc.desktop"

if [[ ! -x "${appimage_path}" ]]; then
  printf 'Missing executable AppImage: %s\n' "${appimage_path}" >&2
  printf 'Run `npm run build:linux` first.\n' >&2
  exit 1
fi

if [[ ! -f "${icon_path}" ]]; then
  printf 'Missing icon: %s\n' "${icon_path}" >&2
  exit 1
fi

mkdir -p "${applications_dir}"

cat > "${desktop_file}" <<EOF
[Desktop Entry]
Type=Application
Name=ChatGPT POC
Comment=ChatGPT Linux desktop wrapper POC
Exec=${appimage_path} --no-sandbox
Icon=${icon_path}
Terminal=false
Categories=Network;
StartupNotify=true
StartupWMClass=chatgpt
EOF

chmod +x "${desktop_file}"

if command -v desktop-file-validate >/dev/null 2>&1; then
  desktop-file-validate "${desktop_file}"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${applications_dir}" >/dev/null 2>&1 || true
fi

printf 'Installed desktop entry: %s\n' "${desktop_file}"
