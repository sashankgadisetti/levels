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
The app is not notarized, so macOS blocks a downloaded copy and offers "Move to Trash". Click
**Done** instead, then run `xattr -cr /Applications/Levels.app` once and open it again; or go to
System Settings → Privacy & Security, scroll down and click **Open Anyway**.
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

**Key without pasting it into the app.** If no key is saved in Settings, the desktop app falls back to, in order:
`ANTHROPIC_API_KEY` in its environment, then the file `anthropic-key` in the app data folder. On macOS, one line sets it up
(the key is read from your terminal, never stored in the repo):

```bash
mkdir -p ~/Library/Application\ Support/dev.levels.app && read -s -p "Anthropic API key: " K && echo && printf '%s' "$K" > ~/Library/Application\ Support/dev.levels.app/anthropic-key && chmod 600 ~/Library/Application\ Support/dev.levels.app/anthropic-key
```

Restart Levels afterwards. Settings → Oracle shows which source the key came from. Delete the file to revoke.

### Updater
Levels updates itself from GitHub Releases (`tauri-plugin-updater`). The installed app fetches
`https://github.com/sashankgadisetti/levels/releases/latest/download/latest.json` 15 s after launch and every 6 h
(or on demand: **Settings → General → [CHECK FOR UPDATES]**). When a newer signed build exists it shows an
**UPDATE AVAILABLE** System window; **INSTALL & RELAUNCH** downloads `Levels.app.tar.gz`, verifies its signature
against the public key in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`, replaces the app and relaunches.
A missing `latest.json` (404) is ignored silently; only the Settings button reports check errors.

**One-time key setup (on your Mac):**
1. Generate a signing keypair (choose a password or leave it empty):
   `npm run tauri signer generate -- -w ~/.tauri/levels.key`
   This writes the private key to `~/.tauri/levels.key` and the public key to `~/.tauri/levels.key.pub`.
   Keep the private key secret and backed up: if you lose it, installed copies can no longer be updated.
2. Paste the **public** key (contents of `levels.key.pub`) into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`,
   replacing the placeholder that is there now (it belongs to a throwaway key), and commit that change.
3. Add two repository secrets (GitHub → Settings → Secrets and variables → Actions → New repository secret):
   - `TAURI_SIGNING_PRIVATE_KEY` = the full contents of `~/.tauri/levels.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = its password (may be empty)

   Or with the GitHub CLI:
   `gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/levels.key` and
   `gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ""` (or your password).

From then on every release built by `.github/workflows/build-macos.yml` (tag `v*` or a manual run with `tag`) is signed and published as a full (not pre-) release, since `releases/latest` skips pre-releases,
and tauri-action uploads `latest.json` and `Levels.app.tar.gz` + `.sig` next to the `.dmg`. Bump the version in
`package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` for each release: the updater only offers a higher version.
Without the secret the workflow still builds (it turns `createUpdaterArtifacts` off) but publishes nothing to update from.

**The first build that contains your real public key must be installed manually once** (from its `.dmg`); builds
from before that either have no updater or trust a different key. Every later release then arrives in-app.
Local `npm run tauri build` also needs `TAURI_SIGNING_PRIVATE_KEY` (and `_PASSWORD`) in the environment, or pass
`--config '{"bundle":{"createUpdaterArtifacts":false}}'`.

## Local API for MCP / automation
While Levels runs it serves a small HTTP API on **127.0.0.1 only** (loopback; never reachable from the network, no CORS),
port `41414` by default (the next free port up to 41434 if that one is taken). The MCP server in `mcp/` uses it.

| Method & path | Auth | Response |
|---|---|---|
| `GET /v1/health` | none | `{ "ok": true, "app": "levels", "version": "0.1.0" }` |
| `GET /v1/tools` | Bearer | `ToolDef[]` (see `src/agent/contract.ts`; `[]` until the window has loaded) |
| `POST /v1/tools/{name}` | Bearer | body = the args object (or `{ "args": {...} }`; empty body = `{}`), max 64 KB → `ToolResult` |

Status codes: `200` with the `ToolResult` (also when `ok:false`), `400` body not a JSON object, `401` missing/wrong token,
`404` unknown tool, `413` body over 64 KB, `503` main window missing, `504` `{ok:false,error:"app did not respond"}` after 15 s.
Tool calls run in the main window exactly like UI actions (so System pop-ups and history behave normally).

Discovery files in the app data dir (`~/Library/Application Support/dev.levels.app`, Linux `~/.local/share/dev.levels.app`,
Windows `%APPDATA%\dev.levels.app`), both mode `0600`:
- `mcp-token` — random 32-byte hex token, created on first launch. Delete it and restart Levels to rotate.
- `mcp-port` — the port bound on this launch.

```
T=$(cat ~/.local/share/dev.levels.app/mcp-token); P=$(cat ~/.local/share/dev.levels.app/mcp-port)
curl -s localhost:$P/v1/health
curl -s -H "Authorization: Bearer $T" localhost:$P/v1/tools
curl -s -X POST -H "Authorization: Bearer $T" -H 'content-type: application/json' -d '{}' localhost:$P/v1/tools/get_status
```

## Linux
- Packages (Debian/Ubuntu): `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev`
- Note `bundle.targets` is currently `["dmg","app"]`; change it (e.g. `"all"`) to package for Linux/Windows.

## Windows
- Microsoft C++ Build Tools and WebView2 (preinstalled on Windows 11). Use `Ctrl` in place of `Cmd` for shortcuts.

## Frontend only
`npm run dev` (Tauri calls no-op in a plain browser; the pop-up is at `/system.html`).
Other scripts: `npm test`, `npm run typecheck`, `npm run build`.
