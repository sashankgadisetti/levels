/** Mirrors of src/agent/contract.ts (kept local so this package builds standalone). */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutating?: boolean;
}

export interface ToolResult {
  ok: boolean;
  content: string;
  data?: unknown;
  error?: string;
  windowShown?: boolean;
}

export interface Health {
  ok: boolean;
  app?: string;
  version?: string;
}
