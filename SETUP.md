# Levels — Setup

## macOS (primary target)

### Prerequisites
- Xcode Command Line Tools: `xcode-select --install`
- Rust via rustup: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Node.js 20+ and npm
- macOS 12 (Monterey) or newer

### Run and build
```
npm install
npm run tauri dev      # desktop app with hot reload
npm run tauri build    # production bundle
```
The build lands in `src-tauri/target/release/bundle/` (`dmg/Levels_*.dmg` and `macos/Levels.app`).
For a universal binary: `rustup target add aarch64-apple-darwin x86_64-apple-darwin` then
`npm run tauri build -- --target universal-apple-darwin` (output under `src-tauri/target/universal-apple-darwin/release/bundle/`).
CI also builds it: see `.github/workflows/build-macos.yml` (manual run or `v*` tag; the `.dmg` is uploaded as an artifact).

### First launch (Gatekeeper)
The app is unsigned, so macOS will refuse a plain double-click. Either right-click the app,
choose **Open**, then **Open** again; or run
`xattr -dr com.apple.quarantine /Applications/Levels.app`.
To sign/notarize later, add the repo secrets `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific password) and `APPLE_TEAM_ID`.

### Using it
- **Notifications**: macOS asks for permission on first use; allow it (System Settings → Notifications → Levels).
- **Launch at login**: toggle in Settings inside the app.
- **Tray**: closing the main window hides it to the menu bar (the Dock icon disappears while hidden). Left-click the tray icon to toggle; menu has Open Levels, Show Daily Quest, Show System Window, Quit.
- **Shortcuts**: `Cmd+Shift+S` toggles the status window, `Cmd+Shift+L` opens quick log.
- **Pop-ups** are a separate frameless always-on-top window at the top-right of the screen under your cursor; they never take focus.
- Launching a second copy just focuses the running one.

### Data
Everything lives in `~/Library/Application Support/dev.levels.app/levels.db` (SQLite) plus the settings store in the same folder.
To reset: quit Levels (tray → Quit) and delete that folder (or just `levels.db`).

### Oracle (Claude)
Settings → Oracle → paste your Anthropic API key (from https://console.anthropic.com). It is optional;
without it the System uses built-in windows. Usage is billed by Anthropic per token on your own key;
each generated window is a short request (typically well under a cent on a small model). Set a monthly budget in the same screen.

### Updater
Auto-update is not enabled yet. TODO: add `tauri-plugin-updater` once release signing keys exist (`npm run tauri signer generate`), and a hosted `latest.json`.

## Linux
- Packages (Debian/Ubuntu): `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev`
- Note `bundle.targets` is currently `["dmg","app"]`; change it (e.g. `"all"`) to package for Linux/Windows.

## Windows
- Microsoft C++ Build Tools and WebView2 (preinstalled on Windows 11). Use `Ctrl` in place of `Cmd` for shortcuts.

## Frontend only
`npm run dev` (Tauri calls no-op in a plain browser; the pop-up is at `/system.html`).
Other scripts: `npm test`, `npm run typecheck`, `npm run build`.
