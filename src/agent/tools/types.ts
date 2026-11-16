import type { z } from "zod";
import type { ToolDef, ToolResult, ToolSource } from "../contract";

export interface ToolCtx { source: ToolSource }

/** A ToolDef plus its zod schema and handler (internal registry entry). */
export interface ToolSpec<S extends z.ZodType = z.ZodType> extends Omit<ToolDef, "inputSchema"> {
  schema: S;
  run(args: z.infer<S>, ctx: ToolCtx): ToolResult | Promise<ToolResult>;
}

/** Helper that keeps the handler's args typed from its schema. */
export const defineTool = <S extends z.ZodType>(t: ToolSpec<S>): ToolSpec => t as unknown as ToolSpec;

export const ok = (content: string, data?: unknown, windowShown?: boolean): ToolResult =>
  ({ ok: true, content, ...(data === undefined ? {} : { data }), ...(windowShown ? { windowShown } : {}) });
export const fail = (error: string, data?: unknown): ToolResult => ({ ok: false, content: error, error, ...(data === undefined ? {} : { data }) });
