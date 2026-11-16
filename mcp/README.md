# @levels/mcp — Levels MCP server

A small stdio [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude Desktop, Claude Code
(or any MCP client) read and update your Levels life-RPG: check your status, log what you did, review the week and
plan the day.

It is only a bridge. The Levels desktop app runs a loopback-only HTTP API (`127.0.0.1`, default port 41414). This
server finds that API through discovery files in the app data dir and turns MCP requests into API calls. Tools are
**not hard-coded**: at startup the server fetches `GET /v1/tools` and registers whatever the app offers, so new app
tools show up without changing this package.

```
Claude ──MCP (stdio)──▶ levels-mcp ──HTTP 127.0.0.1 + bearer token──▶ Levels app (Rust API ▶ tool layer ▶ engine)
```

## Build

Needs Node 20 or newer.

```sh
npm --prefix mcp install
npm --prefix mcp run build      # or from the repo root: npm run mcp:build
npm --prefix mcp test
```

The output is `mcp/dist/index.js`, an executable with a shebang (the package bin is `levels-mcp`).

## Configure your client

Open Levels once first, so it can create its token file. Use the absolute path to your checkout.

**Claude Desktop**: edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS
(`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "levels": {
      "command": "node",
      "args": ["/ABS/PATH/levels/mcp/dist/index.js"]
    }
  }
}
```

Then restart Claude Desktop.

**Claude Code**:

```sh
claude mcp add levels -- node /ABS/PATH/levels/mcp/dist/index.js
```

### Discovery and overrides

| What | Default | Override |
|---|---|---|
| App data dir | macOS `~/Library/Application Support/dev.levels.app` · Linux `$XDG_DATA_HOME/dev.levels.app` (else `~/.local/share/dev.levels.app`) · Windows `%APPDATA%\dev.levels.app` | `LEVELS_DATA_DIR` |
| Port | contents of `<dataDir>/mcp-port`, else `41414` | `LEVELS_API_PORT` |
| Token | contents of `<dataDir>/mcp-token` | `LEVELS_API_TOKEN` |

The server reads these files again before every request. If you restart Levels and it gets a new port or token, the
MCP server picks that up without a restart.

**Levels not running?** The server starts anyway and exposes a single `levels_status` tool. Open Levels and call any
tool, or ask Claude to "check Levels status". The server then loads the real tools and sends `tools/list_changed`, so
you don't have to restart Claude Desktop.

## Tools

Tools come from the app. The current set (see `src/agent/contract.ts`):

| Tool | What it does |
|---|---|
| `get_status` | Level, rank, stats, vitals, streaks, gold, today's goals |
| `get_today` | Today's quest: goals with progress, time left, penalty state |
| `get_history` | Last N closed days (default 14, max 90) |
| `get_config` | Habits, targets, day boundary, economy (read-only) |
| `log_progress` | Numeric progress on a goal or habit |
| `log_text` | Free text parsed into progress entries (applies with `apply: true`) |
| `complete_goal` | Mark a goal done |
| `answer_checkin` | Yes/no habit check-ins |
| `take_rest_day` | Use a weekly rest day on a habit |
| `undo_last_log` | Revert today's most recent progress entry |
| `list_rewards` / `add_reward` / `buy_reward` | Gold shop |
| `ask_system` | Ask the in-app Oracle |
| `propose_targets` | Propose target changes; they apply only after you click ACCEPT in the app |
| `open_screen` | Bring Levels forward on a screen |

Each app result maps to MCP like this: `content` becomes a text block, `data` becomes `structuredContent` (wrapped as
`{ result }` when it isn't an object), and `ok: false` becomes `isError: true`. A mutating tool shows a System window in
the app, with UNDO where that applies.

## Resources

| URI | Backed by |
|---|---|
| `levels://status` | `get_status` |
| `levels://today` | `get_today` |
| `levels://config` | `get_config` |
| `levels://history/{days}` (template, 1–90) | `get_history` |

All resources return `application/json`.

## Prompts

| Prompt | Args | What it does |
|---|---|---|
| `log-day` | `text` | Calls `log_text` with `apply: true`, then reports what was logged and what's left |
| `weekly-review` | none | Reads history, status and config, then calls `propose_targets` with a reasoned plan |
| `plan-my-day` | none | Uses your calendar tools (if any) and `get_today` to build a time-blocked plan, writing nothing unless you confirm |

## Example conversations

> **You:** gym done, 40 min of study, drank 2L water
> **Claude:** *(calls `log_text` with apply: true)* Logged: Gym ✓, Study 40/60 min, Water ✓. 20 min of study is left
> before the day closes at 04:00. A System window in Levels shows the XP you gained.

> **You:** /weekly-review
> **Claude:** *(reads `get_history` days 7, `get_status`, `get_config`)* You hit Study 7/7 at 60 min, and Steps only 3/7.
> I proposed Study 60→75 min and Steps 10k→8k. Accept or decline in Levels.

> **You:** plan my day *(with the Google Calendar connector on)*
> **Claude:** You have meetings 10–12 and at 15:00. Gym 07:00–08:00, Study 13:00–14:00, Reading 21:30. Add these to
> your calendar?

## Security

- The API only listens on loopback (`127.0.0.1`), and every request except `/v1/health` needs the bearer token.
- The app creates the token file (`mcp-token`, 32 random bytes as hex) and the port file with mode `0600`, so only your
  user can read them.
- This server never prints the token. Diagnostics go to stderr, because stdout carries the MCP protocol.
- Writes made through MCP apply right away, the same as clicking in the app, and every one shows a System window.
  Plan changes (`propose_targets`) always need your ACCEPT in the app.

## Errors

| Situation | Message |
|---|---|
| App closed (`ECONNREFUSED`) | `Levels is not running — open the app, then try again.` |
| HTTP 401 | `Levels API token mismatch: restart Levels and the MCP server.` |
| No answer within 20 s | `Levels did not answer within 20 s …` |
| App bridge timeout (504) | `Levels app did not respond in time …` |
