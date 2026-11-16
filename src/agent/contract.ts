/**
 * Agent tool contract — the ONE tool surface for Levels.
 * Consumers: the in-app agent (Claude SDK tool runner, src/agent/runner.ts) and the MCP server
 * (mcp/, via the Rust localhost API). Every mutating tool dispatches engine events through the store,
 * so pop-ups, persistence and history behave exactly as if the user clicked.
 */
import type { JSONSchema7 } from "json-schema";

export type ToolSource = "mcp" | "agent" | "ui";

export interface ToolDef {
  name: string;
  description: string;          // written for the model: what it does, when to use it, units
  inputSchema: JSONSchema7;     // draft-07 object schema, additionalProperties:false
  mutating: boolean;            // true → changes state (and may show a System window)
}

export interface ToolResult {
  ok: boolean;
  /** Plain text for the model (short, factual, System voice is fine). */
  content: string;
  /** Structured payload for programmatic consumers (MCP structuredContent, UI). */
  data?: unknown;
  error?: string;
  /** Set when the call opened a System window (so callers can mention it). */
  windowShown?: boolean;
}

export interface ToolCall { name: string; args: Record<string, unknown>; source: ToolSource }

/** Implemented in src/agent/tools/index.ts (frontend). Rust bridges MCP requests to it. */
export interface ToolHost {
  listTools(): ToolDef[];
  execute(call: ToolCall): Promise<ToolResult>;
}

/** Canonical tool names (keep in sync with docs/06-agentic.md). */
export const TOOL_NAMES = [
  "get_status",        // level, rank, stats, vitals, streaks, gold, today's goals
  "get_today",         // today's quest only (goals with progress, time left, penalty state)
  "get_history",       // last N closed days (default 14, max 90)
  "get_config",        // habits, targets, day boundary, economy (read-only)
  "log_progress",      // {goal_id|habit_id|label, delta?|value?} — numeric goal progress
  "log_text",          // free text → parsed into progress entries (returns a proposal unless apply:true)
  "complete_goal",     // mark a goal done
  "answer_checkin",    // yes/no habits (water)
  "take_rest_day",     // use a weekly rest on a habit that has rest days
  "start_dungeon",     // {minutes?, boss?, goal_id?, use_key?} — open an Instant Dungeon (focus timer)
  "abandon_dungeon",   // leave the open Instant Dungeon (key returned within 2 min)
  "log_past_day",      // amend a day that already ended: mark its goals complete (last 7 days)
  "undo_last_log",     // revert the most recent progress entry made today
  "list_rewards", "add_reward", "buy_reward",
  "ask_system",        // route a question to the Oracle; returns its answer text
  "propose_targets",   // {changes:[{habit_id,target}], reason} → shows an approval window, applies only on ACCEPT
  "open_screen",       // bring the app forward on a screen
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/* ---------- Rust localhost API (src-tauri) ↔ frontend bridge ---------- */

/** Rust → main window: a tool request arriving from the localhost API. */
export const TOOL_REQUEST_EVENT = "levels://tool-request";
export interface ToolRequestEvent { id: string; name: string; args: Record<string, unknown>; source: ToolSource }
/** Frontend → Rust: `invoke("tool_response", { id, result })`. */
export const TOOL_RESPONSE_COMMAND = "tool_response";
/** Frontend → Rust on startup: `invoke("register_tools", { tools })` so GET /v1/tools can answer without a round trip. */
export const REGISTER_TOOLS_COMMAND = "register_tools";

/**
 * Localhost API (Rust, 127.0.0.1 only):
 *   GET  /v1/health                → { ok:true, app:"levels", version }
 *   GET  /v1/tools                 → ToolDef[]
 *   POST /v1/tools/:name  {args}   → ToolResult      (bridged to the webview; 15 s timeout → 504)
 * Auth: `Authorization: Bearer <token>` on every request except /v1/health.
 * Discovery files in the app data dir (0600):
 *   <appDataDir>/mcp-token   (random 32-byte hex, created on first launch)
 *   <appDataDir>/mcp-port    (the bound port; default 41414, next free if taken)
 * appDataDir: macOS ~/Library/Application Support/dev.levels.app, Linux ~/.local/share/dev.levels.app,
 *             Windows %APPDATA%\dev.levels.app
 */
export const DEFAULT_API_PORT = 41414;
