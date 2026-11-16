# 06 · Agentic layer & MCP

One tool surface (`src/agent/contract.ts`), two consumers:

```
Claude Desktop / Claude Code / phone ──MCP (stdio)──▶ mcp/ bridge ──HTTP 127.0.0.1:41414 + token──▶ Rust API
                                                                                                      │ event
In-app agent (SDK tool runner, src/agent/runner.ts) ───────────────────────────────┐                  ▼
                                                                                   └──▶ src/agent/tools (ToolHost) ──▶ store.dispatch ──▶ engine
```

Rules:
1. Every mutation is an engine event through the store. No tool touches SQLite or state directly.
2. Reads execute immediately. Writes from the **MCP** apply immediately (the user asked Claude to do it) and open a System window showing what changed, with UNDO where it applies. Writes from the **in-app agent** that change plans (targets, gates, projects) open an approval window; nothing applies until ACCEPT.
3. The model gets a compact digest, never raw history beyond `get_history` limits.
4. Daily budget cap applies to all agent calls (shared with the Oracle).

## Features in this phase
| Feature | Where | Model |
|---|---|---|
| Free-text logging ("gym done, 40 min study, 2 meals") | Quick bar in header, `log_text` tool | claude-haiku-5-5, structured output |
| Weekly re-evaluation (targets + next Gate + verdict) | Status screen button; auto-offered Sunday evening | claude-opus-5-5, tool runner |
| Project "boss fights" (deadline → daily strikes, weekly re-plan) | Projects screen, `src/engine/projects.ts` | claude-opus-5-5 |
| Calendar-aware planning | MCP prompt `plan-my-day` used from Claude Desktop with its Calendar connector | client's model |

## MCP server (`mcp/`)
- stdio, `@modelcontextprotocol/sdk`; discovers the app via `mcp-port` / `mcp-token` files in the app data dir.
- Tools: registered dynamically from `GET /v1/tools` at startup (so new app tools appear automatically).
- Resources: `levels://status`, `levels://today`, `levels://history/{days}`, `levels://config` (backed by the get_* tools).
- Prompts: `weekly-review`, `plan-my-day`, `log-day`.
- If the app is not running: tools return an error that says to open Levels.
