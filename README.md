# ChatGPT Electron Wrapper (Ubuntu/Linux)

A native Electron desktop wrapper that opens ChatGPT in an app window.

## Developer

- Stephan Coertzen `<coertzen.jfs@gmail.com>`

## Prerequisites (Ubuntu)

```bash
sudo apt update
sudo apt install -y libnss3 libatk-bridge2.0-0 libgtk-3-0 libxss1 libasound2
```

## Install

```bash
npm install
```

## Run the app

```bash
npm start
```

## Build Linux packages

```bash
npm run build:linux
```

Build outputs are generated in `dist/`:
- `.AppImage`
- `.deb`

## Local POC desktop entry

After building the AppImage, install a local application menu entry:

```bash
./scripts/install-desktop-entry.sh
```

This creates `~/.local/share/applications/chatgpt-poc.desktop` pointing to the
current AppImage in `dist/`.

The POC entry currently starts the AppImage with `--no-sandbox`, which is useful
for local AppImage testing when the Electron `chrome-sandbox` helper is not
installed with setuid permissions. Do not treat that as the target packaging
model for a hardened system install.

## GitHub Release Flow

Pushing a version tag (for example `v1.0.1`) triggers automated Linux builds and publishes a GitHub Release with attached artifacts. The release page notes are generated from every commit after `releaseNotes.fromHash` in `package.json`.

```bash
git add .
git commit -m "release: v1.0.1"
git tag v1.0.1
git push origin main --tags
```
