/**
 * Rust localhost API ↔ webview bridge (see src/agent/contract.ts, src-tauri/src/api.rs).
 * Rust emits TOOL_REQUEST_EVENT for each POST /v1/tools/:name and waits (15 s) for `tool_response`.
 */
import {
  REGISTER_TOOLS_COMMAND,
  TOOL_REQUEST_EVENT,
  TOOL_RESPONSE_COMMAND,
  type ToolHost,
  type ToolRequestEvent,
  type ToolResult,
} from "../agent/contract";
import { invoke, isTauri, listen } from "./tauri";

let installed = false;

/** Register the tool list with Rust and answer bridged tool requests. No-op outside Tauri; idempotent. */
export function installToolBridge(host: ToolHost): void {
  if (!isTauri() || installed) return;
  installed = true;

  const register = () =>
    invoke(REGISTER_TOOLS_COMMAND, { tools: host.listTools() }).catch((e) =>
      console.warn("[bridge] register_tools failed", e),
    );
  void register();

  void listen<ToolRequestEvent>(TOOL_REQUEST_EVENT, async (req) => {
    let result: ToolResult;
    try {
      result = await host.execute({ name: req.name, args: req.args ?? {}, source: req.source ?? "mcp" });
    } catch (e) {
      result = { ok: false, content: "", error: e instanceof Error ? e.message : String(e) };
    }
    try {
      await invoke(TOOL_RESPONSE_COMMAND, { id: req.id, result });
    } catch (e) {
      console.warn("[bridge] tool_response failed", e);
    }
  });
}

/** Re-send the tool list (call if the set of tools changes at runtime). */
export async function refreshRegisteredTools(host: ToolHost): Promise<void> {
  await invoke(REGISTER_TOOLS_COMMAND, { tools: host.listTools() });
}

export interface LocalApiInfo { port: number; tokenPath: string }

/** Where the localhost API is listening; null outside Tauri or before it has bound. */
export async function getLocalApiInfo(): Promise<LocalApiInfo | null> {
  try {
    return (await invoke<LocalApiInfo | null>("local_api_info")) ?? null;
  } catch {
    return null;
  }
}
