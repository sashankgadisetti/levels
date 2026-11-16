# Handoff — state of Levels as of v0.2.7 (2026-11-16)

Read this first in a new session. Branch: `claude/wizardly-brahmagupta-tjgy91` (the de-facto main branch). Releases: GitHub Releases on `sashankgadisetti/levels`.

## What exists and works (verified)
- Desktop app (Tauri 2 + React 19 + TS): Daily Quest with 5 habits (Workout/STR, Study/INT, Sleep/SENSE, Clean meals/VIT, Water/HYDRATION yes-no check-ins), System pop-ups in a separate always-on-top window, XP/levels/ranks, titles/skills, shadows, shop with real-world rewards, Gates (project boss fights), Instant Dungeons (focus timer, keys), penalty system, log past days, Oracle (Claude-generated windows), in-app agent (quick bar Ctrl/Cmd+J, weekly re-evaluation), MCP server (`mcp/`), localhost tool API (Rust, 127.0.0.1:41414 + token file), auto-updater via GitHub Releases.
- Tests: `npm test` (166), `npm --prefix mcp test` (14). `npm run typecheck`, `npm run build`, `cd src-tauri && cargo check` all green. This Linux container can compile and run the app under Xvfb (`:99`) and drive it with xdotool; browser build runs with `npx vite --port 1420` and Playwright (`/opt/node-tools/node_modules/playwright`).

## Release routine (the only way to ship)
1. Bump the version in `package.json`, `package-lock.json` (two places), `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
2. Commit + push the branch.
3. Trigger the GitHub Actions workflow `build-macos.yml` on the branch with input `tag: vX.Y.Z` (GitHub MCP `actions_run_trigger`, method `run_workflow`). ~5–8 min. It creates the tag, the Release, the `.dmg`, and (because the signing secret exists) `latest.json` + `Levels_universal.app.tar.gz(.sig)`.
4. Installed apps (≥0.2.3) see "[UPDATE AVAILABLE]" within 15 s of launch or via Settings → General → [CHECK FOR UPDATES] → [INSTALL & RELAUNCH].
- Secrets in the repo: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty). Public key is in `tauri.conf.json` → `plugins.updater.pubkey`. Apple notarization secrets are NOT set (unsigned app → Gatekeeper dialog on first install only).
- This session's GitHub credentials cannot push tags or set secrets; the workflow's tag input is the workaround.

## User facts
- macOS, name "Shank" in-app, installs via auto-update (last manual install was 0.2.4). Has an Anthropic key in the app via the `anthropic-key` file / Settings → Oracle.
- Prefers: user-friendly design, pop-ups on the desktop, agentic features, MCP. Wants things shipped and verified, not planned.

## Known gaps / next ideas
- Whole-day "rest day" (currently only per-habit via the Rest button; Workout only by default).
- Sleep makeup for the penalty can only be met by the next morning's sleep log.
- A System pop-up already on screen does not refresh counters when a tool logs progress (next window is correct).
- Dungeon `strikeDue` reminder window exists but nothing triggers it.
- Calendar-aware planning is via the MCP prompt `plan-my-day` in Claude Desktop (no in-app OAuth).
- Rotate the Anthropic API key and the update-signing key: both passed through chat once.

## Where things live
`docs/01–06` design docs · `src/engine` pure reducer · `src/agent` tools/agent · `src/oracle` Claude windows · `src/lib/updater.ts` · `src-tauri/src/api.rs` localhost API · `mcp/` MCP server · `.github/workflows/build-macos.yml`.
