/**
 * Oracle schema layer. The contract itself lives in src/system/spec.ts; this
 * file only (a) re-exports it and (b) adapts the zod-generated JSON schema to
 * what the Messages API structured-output endpoint accepts.
 *
 * Whatever the API enforces, `parseSpec` (zod) is the real gate: every Oracle
 * output is re-validated with it before it reaches the UI.
 */
import { z } from "zod";
import { SystemWindowSpec, parseSpec, systemWindowJsonSchema } from "../system/spec";

export { SystemWindowSpec, parseSpec, systemWindowJsonSchema };
export type { Action, Block, Variant } from "../system/spec";

/** Action kinds the Oracle may put on a window. Narrower than the full spec enum:
 *  the model may navigate and accept/decline, never mutate game state. */
export const ORACLE_ACTION_KINDS = [
  "dismiss", "accept", "decline",
  "open:status", "open:quest", "open:shop", "open:shadows", "open:inventory",
  "start:dungeon",
] as const;

/** Wrapper used when a caller wants a one-field object (e.g. for tests / tooling). */
export const OracleOutput = z.object({ spec: SystemWindowSpec });
export type OracleOutput = z.infer<typeof OracleOutput>;

type Json = Record<string, unknown>;

/** Keywords structured outputs does not support; length/range limits are
 *  enforced afterwards by zod instead. */
const UNSUPPORTED = new Set([
  "$schema", "minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum",
  "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "pattern", "default",
  "propertyNames", "minProperties", "maxProperties", "format", "contentEncoding",
]);

/** Properties the model must never set (engine / renderer own them). */
const HIDDEN_ROOT_PROPS = ["generated", "id"];

function isObj(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function walk(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(walk);
  if (!isObj(node)) return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node)) {
    if (UNSUPPORTED.has(k)) continue;
    out[k === "oneOf" ? "anyOf" : k] = walk(v);
  }
  // Tuples (prefixItems) -> plain string arrays; zod re-checks the arity.
  if (Array.isArray(out.prefixItems)) {
    delete out.prefixItems;
    out.items = { type: "string" };
    delete out.additionalItems;
  }
  if (out.type === "object" || isObj(out.properties)) {
    out.additionalProperties = false;
  }
  return out;
}

/** JSON schema handed to `output_config.format`. */
export function oracleJsonSchema(): Json {
  const raw = systemWindowJsonSchema() as Json;
  const schema = walk(raw) as Json;
  const props = schema.properties as Json | undefined;
  if (props) {
    for (const h of HIDDEN_ROOT_PROPS) delete props[h];
    if (Array.isArray(schema.required)) {
      schema.required = (schema.required as string[]).filter((r) => !HIDDEN_ROOT_PROPS.includes(r));
    }
  }
  return schema;
}
