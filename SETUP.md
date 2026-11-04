# Levels — Setup

## Prerequisites
- Rust toolchain (stable) via https://rustup.rs
- Node.js 20+ and npm
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `webkit2gtk-4.1`, `libgtk-3-dev`, `libayatana-appindicator3-dev` (or `libappindicator3-dev`), `librsvg2-dev`, `libsoup-3.0-dev`, `libjavascriptcoregtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `pkg-config`
  (Debian/Ubuntu: `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev`)
- **Windows**: Microsoft C++ Build Tools and WebView2 (preinstalled on Windows 11)

## Run
```
npm install
npm run tauri dev      # desktop app with hot reload
npm run tauri build    # production bundle
```
Frontend only (no Rust): `npm run dev` (Tauri calls no-op in a plain browser; the pop-up is at `/system.html`).

Other scripts: `npm test`, `npm run typecheck`, `npm run build`.
