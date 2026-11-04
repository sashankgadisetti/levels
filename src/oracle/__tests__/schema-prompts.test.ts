import { describe, expect, it } from "vitest";
import { buildDigest, estimateTokens } from "../digest";
import { EXAMPLES, SYSTEM_PROMPT } from "../prompts";
import { oracleJsonSchema, parseSpec, systemWindowJsonSchema } from "../schema";
import { LocalStorageOracleCache, isoWeek } from "../cache";
import { makeState, NOW } from "./helpers";

function* objects(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) { for (const n of node) yield* objects(n); return; }
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o.type === "object") yield o;
    for (const v of Object.values(o)) yield* objects(v);
  }
}

describe("schema", () => {
  it("raw zod schema has the keywords we must post-process; ours is clean", () => {
    const s = oracleJsonSchema();
    const json = JSON.stringify(s);
    expect(JSON.stringify(systemWindowJsonSchema())).toContain("maxLength");
    for (const k of ["$schema", "maxLength", "minLength", "maxItems", "prefixItems", "oneOf", "\"minimum\"", "\"maximum\""]) {
      expect(json).not.toContain(k);
    }
    const objs = [...objects(s)];
    expect(objs.length).toBeGreaterThan(10);
    for (const o of objs) expect(o.additionalProperties).toBe(false);
    expect((s.properties as any).generated).toBeUndefined();
  });

  const samples = [
    { type: "text", text: "x", tone: "cyan", align: "center" },
    { type: "goalRow", goalId: "g", label: "L", current: 0, target: 1, unit: "u", stat: "STR", done: false },
    { type: "statRow", stat: "STR", value: 10, delta: 1, max: 99, locked: false },
    { type: "bar", label: "HP", value: 5, max: 10, tone: "red" },
    { type: "kv", rows: [["A", "B"]] },
    { type: "timer", endsAt: "2026-11-05T03:00:00Z", label: "T", tone: "red" },
    { type: "list", items: ["a"], tone: "dim" },
    { type: "divider" },
    { type: "itemCard", name: "N", rarity: "rare", description: "d", goldPrice: 1 },
    { type: "shadow", name: "Veyr", rank: "Normal Soldier", epithet: "e" },
    { type: "rankBadge", rank: "D", previous: "E" },
  ];
  it.each(samples)("block %# round-trips through parseSpec", (block) => {
    const r = parseSpec({ variant: "info", title: "T", blocks: [block], actions: [], sound: "none" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.blocks[0]).toEqual(block);
  });

  it("all few-shot examples are valid specs", () => {
    expect(EXAMPLES).toHaveLength(3);
    for (const e of EXAMPLES) expect(parseSpec(e.spec).success).toBe(true);
  });
});

describe("digest", () => {
  it("is compact, structured and has no raw history", () => {
    const d = buildDigest(makeState(), NOW);
    expect(estimateTokens(d)).toBeLessThan(600);
    expect(d.now).toMatchObject({ date: "2026-11-04", weekday: "Wed", time: "09:30" });
    expect(d.player).toMatchObject({ level: 12, rank: "E", xpPct: 20, title: "WOLF ASSASSIN" });
    expect(d.goals.map((g) => g.id)).toEqual(["g-gym", "g-study", "g-sleep", "g-eat"]);
    expect(d.cleared).toBe("1/4");
    expect(d.yesterday).toEqual({ date: "2026-11-03", result: "partial", cleared: "1/2" });
    expect(JSON.stringify(d)).not.toContain("startedAt");
  });
});

describe("prompts", () => {
  const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16); };
  it("SYSTEM_PROMPT is stable (update deliberately if you edit it)", () => {
    expect({ length: SYSTEM_PROMPT.length, hash: hash(SYSTEM_PROMPT) }).toMatchInlineSnapshot(`
      {
        "hash": "ca670bd4",
        "length": 5318,
      }
    `);
  });
  it("contains no volatile data", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/2026-\d\d-\d\d/);
  });
});

describe("cache", () => {
  it("localStorage cache round-trips and degrades without storage", () => {
    const mem = new Map<string, string>();
    const c = new LocalStorageOracleCache({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) });
    c.set("oracle:dayStart:2026-11-04", { a: 1 });
    expect(c.get("oracle:dayStart:2026-11-04")).toEqual({ a: 1 });
    expect(mem.has("oracle:dayStart:2026-11-04")).toBe(true);
    const d = new LocalStorageOracleCache(undefined);
    d.set("k", 2);
    expect(d.get("k")).toBe(2);
  });
  it("isoWeek", () => {
    expect(isoWeek("2026-11-04")).toBe("2026-W45");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });
});
