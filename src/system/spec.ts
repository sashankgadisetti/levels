/**
 * SystemWindowSpec — the ONE contract every pop-up window goes through.
 * Hand-written windows (engine effects) and Oracle-generated windows (Claude)
 * both produce this; the React renderer in src/components/system renders it.
 * Keep this closed: the model may only pick from these blocks and actions.
 */
import { z } from "zod";

export const Variant = z.enum([
  "info", "quest", "warning", "reward", "levelup", "penalty", "status", "shop", "shadow", "gate",
]);
export type Variant = z.infer<typeof Variant>;

export const Glyph = z.enum(["alert", "diamond", "skull", "crown", "box", "none"]);
export const Sound = z.enum(["ding", "levelup", "arise", "alarm", "none"]);
export const Tone = z.enum(["cyan", "red", "gold", "purple", "dim"]);

/** Closed set of things a window button may do. `complete:goal` etc. carry an arg. */
export const Action = z.object({
  label: z.string().min(1).max(24),
  kind: z.enum([
    "dismiss", "accept", "decline",
    "open:status", "open:quest", "open:shop", "open:shadows", "open:inventory",
    "complete:goal", "progress:goal", "answer:yes", "answer:no", "allocate:points", "start:dungeon", "open:box", "use:item", "extract:shadow",
  ]),
  arg: z.string().max(64).optional(),
  primary: z.boolean().optional(),
});
export type Action = z.infer<typeof Action>;

export const Block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(400), tone: Tone.optional(), align: z.enum(["left", "center"]).optional() }),
  z.object({ type: z.literal("goalRow"), goalId: z.string(), label: z.string().max(48), current: z.number(), target: z.number(), unit: z.string().max(12), stat: z.string().max(8).optional(), done: z.boolean().optional(), mode: z.enum(["yesno"]).optional() }),
  z.object({ type: z.literal("statRow"), stat: z.string().max(16), value: z.number(), delta: z.number().optional(), max: z.number().optional(), locked: z.boolean().optional() }),
  z.object({ type: z.literal("bar"), label: z.string().max(24), value: z.number(), max: z.number(), tone: Tone.optional() }),
  z.object({ type: z.literal("kv"), rows: z.array(z.tuple([z.string().max(32), z.string().max(64)])).max(12) }),
  z.object({ type: z.literal("timer"), endsAt: z.string(), label: z.string().max(40).optional(), tone: Tone.optional() }),
  z.object({ type: z.literal("list"), items: z.array(z.string().max(140)).max(10), tone: Tone.optional() }),
  z.object({ type: z.literal("divider") }),
  z.object({ type: z.literal("itemCard"), name: z.string().max(48), rarity: z.enum(["common", "rare", "epic", "legendary"]), description: z.string().max(200), goldPrice: z.number().optional(), usdPrice: z.number().optional(), affordable: z.boolean().optional() }),
  z.object({ type: z.literal("shadow"), name: z.string().max(32), rank: z.string().max(24), epithet: z.string().max(80).optional() }),
  z.object({ type: z.literal("rankBadge"), rank: z.string().max(16), previous: z.string().max(16).optional() }),
]);
export type Block = z.infer<typeof Block>;

export const SystemWindowSpec = z.object({
  id: z.string().max(64).optional(),
  variant: Variant,
  title: z.string().min(1).max(80),
  glyph: Glyph.optional(),
  blocks: z.array(Block).max(14),
  actions: z.array(Action).max(3).default([]),
  footer: z.string().max(160).optional(),
  sound: Sound.default("ding"),
  timeoutMs: z.number().int().min(0).max(600_000).optional(),
  /** true when Claude wrote it; renderer shows a tiny "oracle" mark */
  generated: z.boolean().optional(),
});
export type SystemWindowSpec = z.infer<typeof SystemWindowSpec>;
export type SystemWindowInput = z.input<typeof SystemWindowSpec>;

export const parseSpec = (raw: unknown) => SystemWindowSpec.safeParse(raw);

/** JSON schema for Claude structured outputs (output_config.format). */
export const systemWindowJsonSchema = () => z.toJSONSchema(SystemWindowSpec, { target: "draft-2020-12" });

/** Event the popup window emits back to the main window when a button is pressed. */
export type SystemActionEvent = { windowId?: string; action: Action };
