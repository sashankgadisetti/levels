/**
 * The ONE tool surface (contract: src/agent/contract.ts). Used by the in-app agent runner,
 * the quick bar, and the MCP server (bridged by the Rust localhost API).
 */
import { z } from "zod";
import type { JSONSchema7 } from "json-schema";
import { TOOL_NAMES, type ToolCall, type ToolDef, type ToolHost, type ToolName, type ToolResult } from "../contract";
import { READ_TOOLS } from "./reads";
import { WRITE_TOOLS } from "./writes";
import type { ToolSpec } from "./types";

export { SCHEMAS } from "./schemas";
export type { ToolSpec, ToolCtx } from "./types";
export { showLogProposal, applyEntries } from "./writes";

const ALL: ToolSpec[] = [...READ_TOOLS, ...WRITE_TOOLS];
const BY_NAME = new Map<string, ToolSpec>(ALL.map((t) => [t.name, t]));

// Every canonical name has exactly one handler (fails fast at import time, and in tests).
for (const n of TOOL_NAMES) if (!BY_NAME.has(n)) throw new Error(`[agent] missing tool handler: ${n}`);

export const getToolSpec = (name: string): ToolSpec | undefined => BY_NAME.get(name);

function toJsonSchema(schema: z.ZodType): JSONSchema7 {
  const js = z.toJSONSchema(schema, { target: "draft-07" }) as JSONSchema7;
  return { ...js, type: "object", additionalProperties: false, properties: js.properties ?? {} };
}

/** Tool definitions in canonical order (TOOL_NAMES). */
export const TOOLS: ToolDef[] = TOOL_NAMES.map((n) => {
  const t = BY_NAME.get(n)!;
  return { name: t.name, description: t.description, inputSchema: toJsonSchema(t.schema), mutating: t.mutating };
});

/** Execute one call. Never throws: bad names / args / handler errors come back as ok:false. */
export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const t = BY_NAME.get(call.name);
  if (!t) return { ok: false, content: `Unknown tool "${call.name}".`, error: `unknown tool: ${call.name}` };
  const parsed = t.schema.safeParse(call.args ?? {});
  if (!parsed.success) {
    const msg = parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(args)"}: ${i.message}`).join("; ");
    return { ok: false, content: `Invalid arguments for ${call.name}: ${msg}`, error: msg };
  }
  try {
    return await t.run(parsed.data, { source: call.source });
  } catch (err) {
    console.error("[agent] tool failed", call.name, err);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, content: `${call.name} failed: ${msg}`, error: msg };
  }
}

export const toolHost: ToolHost = {
  listTools: () => TOOLS,
  execute: executeTool,
};

export const isToolName = (n: string): n is ToolName => (TOOL_NAMES as readonly string[]).includes(n);
