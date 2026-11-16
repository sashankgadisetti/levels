import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  type CallToolResult,
  type GetPromptResult,
  type Prompt,
  type Resource,
  type ResourceTemplate,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { LevelsClient, LevelsError, MSG_NOT_RUNNING } from "./client.js";
import type { ToolDef, ToolResult } from "./types.js";

export const STATUS_TOOL = "levels_status";

const STATUS_TOOL_DEF: Tool = {
  name: STATUS_TOOL,
  description:
    "Check whether the Levels app is running and reachable. Levels' real tools (status, logging, quests, rewards) " +
    "appear automatically once the app is open; call this after opening Levels to load them.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, title: "Levels status" },
};

/* ---------------- resources ---------------- */

const STATIC_RESOURCES: (Resource & { tool: string })[] = [
  { uri: "levels://status", name: "status", title: "Levels status", tool: "get_status", mimeType: "application/json",
    description: "Level, rank, stats, vitals, streaks, gold and today's goals." },
  { uri: "levels://today", name: "today", title: "Today's quest", tool: "get_today", mimeType: "application/json",
    description: "Today's daily quest: goals with progress, time left, penalty state." },
  { uri: "levels://config", name: "config", title: "Levels config", tool: "get_config", mimeType: "application/json",
    description: "Habits, targets, day boundary and economy (read-only)." },
];

const HISTORY_TEMPLATE: ResourceTemplate = {
  uriTemplate: "levels://history/{days}",
  name: "history",
  title: "Levels history",
  description: "The last N closed days (1–90).",
  mimeType: "application/json",
};

/* ---------------- prompts ---------------- */

const PROMPTS: Prompt[] = [
  {
    name: "log-day",
    title: "Log my day",
    description: "Log free-text progress (\"gym done, 40 min study, 2 meals\") into Levels.",
    arguments: [{ name: "text", description: "What you did, in your own words.", required: true }],
  },
  {
    name: "weekly-review",
    title: "Weekly review",
    description: "Review the last week and propose new targets (applied only after you accept in the app).",
  },
  {
    name: "plan-my-day",
    title: "Plan my day",
    description: "Combine your calendar with today's quest into a time-blocked plan (no writes without confirmation).",
  },
];

function promptMessages(name: string, args: Record<string, string> | undefined): GetPromptResult {
  const user = (text: string, description: string): GetPromptResult => ({
    description,
    messages: [{ role: "user", content: { type: "text", text } }],
  });
  switch (name) {
    case "log-day": {
      const text = args?.text?.trim();
      if (!text) throw new McpError(ErrorCode.InvalidParams, "log-day requires a 'text' argument.");
      return user(
        `Log this in Levels by calling the \`log_text\` tool with \`apply: true\` and this exact text:\n\n"""\n${text}\n"""\n\n` +
          "Then report back briefly: which goals/habits got progress (with amounts), anything that could not be matched, " +
          "and what is still left for today (call `get_today` if the result doesn't say). If something was logged wrongly, " +
          "offer to call `undo_last_log`.",
        "Log free-text progress into Levels",
      );
    }
    case "weekly-review":
      return user(
        "Run my weekly review in Levels.\n\n" +
          "1. Read my data: call `get_history` with `days: 7` (and `days: 28` if you need a longer trend), `get_status`, and `get_config`.\n" +
          "2. Analyse each habit: hit rate vs target, streaks, misses and penalties, and whether the target is too easy, right, or too hard. " +
          "Aim for a sustainable ~70–85% hit rate; prefer small steps (about 10–20%).\n" +
          "3. Write a short verdict for the week (System voice is fine) and a reasoned plan.\n" +
          "4. Call `propose_targets` with the concrete `changes` (`habit_id`, `target`) and a `reason` that summarises the evidence. " +
          "This only opens an approval window in the app — nothing changes until I accept.\n" +
          "5. Tell me what you proposed and why. If nothing should change, say so and skip the proposal.",
        "Weekly review → propose_targets",
      );
    case "plan-my-day":
      return user(
        "Help me plan today.\n\n" +
          "1. If you have calendar tools available (e.g. a Google Calendar or Outlook connector), list today's events and free slots. " +
          "If you don't, ask me for my fixed commitments.\n" +
          "2. Call `get_today` from Levels for today's quest: remaining goals, progress, time left and penalty risk.\n" +
          "3. Propose a realistic time-blocked plan for the rest of the day that fits the open quest goals around my events " +
          "(hardest/most at-risk goals first, include breaks and meals, respect the day boundary).\n" +
          "4. Do NOT create calendar events or log anything in Levels unless I explicitly confirm. Ask at the end whether I want " +
          "the blocks added to my calendar.",
        "Calendar-aware plan for today",
      );
    default:
      throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`);
  }
}

/* ---------------- result mapping ---------------- */

/** ToolResult → MCP CallToolResult. structuredContent must be a JSON object, so non-objects are wrapped. */
export function toCallToolResult(r: ToolResult): CallToolResult {
  let text = r.content ?? "";
  if (!r.ok && r.error && !text.includes(r.error)) text = text ? `${text}\n\nError: ${r.error}` : `Error: ${r.error}`;
  if (r.windowShown) text += (text ? "\n\n" : "") + "(A System window is showing this in the Levels app.)";
  const out: CallToolResult = { content: [{ type: "text", text: text || (r.ok ? "OK" : "Failed") }], isError: !r.ok };
  if (r.data !== undefined && r.data !== null) {
    out.structuredContent =
      typeof r.data === "object" && !Array.isArray(r.data) ? (r.data as Record<string, unknown>) : { result: r.data };
  }
  return out;
}

function errorResult(e: unknown): CallToolResult {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text", text: msg }], isError: true };
}

function toMcpTool(t: ToolDef): Tool {
  const schema =
    t.inputSchema && typeof t.inputSchema === "object" && t.inputSchema.type === "object"
      ? t.inputSchema
      : { type: "object", properties: {} };
  const tool: Tool = { name: t.name, description: t.description, inputSchema: schema as Tool["inputSchema"] };
  if (typeof t.mutating === "boolean") tool.annotations = { readOnlyHint: !t.mutating };
  return tool;
}

/* ---------------- server ---------------- */

export interface LevelsServerOptions {
  client?: LevelsClient;
  version?: string;
  /** Called with diagnostic lines (stderr in the CLI). Never receives the token. */
  log?: (msg: string) => void;
}

export interface LevelsServer {
  server: Server;
  /** Fetch GET /v1/tools; returns true on success. Sends tools/list_changed when the set changed. */
  refreshTools(): Promise<boolean>;
  readonly tools: ToolDef[];
}

export function createLevelsServer(opts: LevelsServerOptions = {}): LevelsServer {
  const client = opts.client ?? new LevelsClient();
  const log = opts.log ?? (() => {});
  const server = new Server(
    { name: "levels", title: "Levels", version: opts.version ?? "0.0.0" },
    {
      capabilities: { tools: { listChanged: true }, resources: {}, prompts: {} },
      instructions:
        "Levels is the user's Solo Leveling-style life RPG (daily quests, habits, XP, gold). Use get_status/get_today to read " +
        "state, log_text or log_progress to record what the user did, and propose_targets for plan changes (it asks the user " +
        "to approve in the app). Mutating tools apply immediately and show a System window in the app.",
    },
  );

  let tools: ToolDef[] = [];
  let signature = "";

  const notifyChanged = () => {
    server.sendToolListChanged().catch(() => {});
  };

  async function refreshTools(): Promise<boolean> {
    try {
      const next = await client.listTools();
      const sig = JSON.stringify(next.map((t) => [t.name, t.description, t.inputSchema]));
      const changed = sig !== signature;
      tools = next;
      signature = sig;
      if (changed) {
        log(`loaded ${next.length} tools from Levels`);
        // Only notify once connected (the initial load happens before the client exists).
        if (server.transport) notifyChanged();
      }
      return true;
    } catch (e) {
      log(`tool discovery failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    if (tools.length === 0) await refreshTools();
    return { tools: tools.length ? tools.map(toMcpTool) : [STATUS_TOOL_DEF] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name } = req.params;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;

    if (name === STATUS_TOOL) {
      try {
        const h = await client.health();
        const ok = await refreshTools();
        if (!ok) await client.listTools(); // surface the real error (e.g. token mismatch)
        return {
          content: [{
            type: "text",
            text: `Levels ${h.version ?? ""} is running. ${tools.length} tools available: ${tools.map((t) => t.name).join(", ")}.`
              .replace(/\s+/g, " ").trim(),
          }],
          structuredContent: { running: true, version: h.version ?? null, tools: tools.map((t) => t.name) },
        };
      } catch (e) {
        const msg = e instanceof LevelsError && e.kind === "not_running" ? "Levels is not running — open the app." : (e as Error).message;
        return { content: [{ type: "text", text: msg }], structuredContent: { running: false }, isError: true };
      }
    }

    try {
      // Lazy re-discovery: if the app was closed at startup, load its tools now.
      if (tools.length === 0) await refreshTools();
      const res = await client.callTool(name, args);
      return toCallToolResult(res);
    } catch (e) {
      if (e instanceof LevelsError && e.kind === "not_found") {
        // The app may have changed its tool set; refresh so the client sees the current list.
        void refreshTools();
        return errorResult(new Error(`Unknown Levels tool: ${name}`));
      }
      return errorResult(e);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: STATIC_RESOURCES.map(({ tool: _tool, ...r }) => r),
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [HISTORY_TEMPLATE],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const { uri } = req.params;
    let tool: string;
    let args: Record<string, unknown> = {};
    const fixed = STATIC_RESOURCES.find((r) => r.uri === uri);
    const hist = /^levels:\/\/history\/(\d+)$/.exec(uri);
    if (fixed) tool = fixed.tool;
    else if (hist) {
      const days = Number(hist[1]);
      if (days < 1 || days > 90) throw new McpError(ErrorCode.InvalidParams, "history days must be between 1 and 90");
      tool = "get_history";
      args = { days };
    } else {
      throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${uri}`);
    }

    let res: ToolResult;
    try {
      res = await client.callTool(tool, args);
    } catch (e) {
      throw new McpError(ErrorCode.InternalError, e instanceof Error ? e.message : String(e));
    }
    if (!res.ok) throw new McpError(ErrorCode.InternalError, res.error || res.content || `${tool} failed`);
    const payload = res.data !== undefined ? res.data : { text: res.content };
    return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(payload, null, 2) }] };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) =>
    promptMessages(req.params.name, req.params.arguments as Record<string, string> | undefined),
  );

  return {
    server,
    refreshTools,
    get tools() {
      return tools;
    },
  };
}

export { MSG_NOT_RUNNING };
