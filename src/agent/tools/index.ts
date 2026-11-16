// PLACEHOLDER — replaced by the tool-layer agent
import type { ToolHost } from "../contract";

export const toolHost: ToolHost = {
  listTools: () => [],
  execute: async () => ({ ok: false, content: "", error: "tools not implemented" }),
};
