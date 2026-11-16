import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LevelsClient, MSG_NOT_RUNNING, MSG_UNAUTHORIZED } from "../src/client.js";
import type { Discovery } from "../src/discovery.js";
import { createLevelsServer, STATUS_TOOL, toCallToolResult } from "../src/server.js";
import { FAKE_TOOLS, freePort, startFake, TOKEN, type Fake } from "./fakeServer.js";

const disc = (port: number, token: string | undefined = TOKEN): (() => Discovery) => () => ({
  port, token, baseUrl: `http://127.0.0.1:${port}`, dataDir: "/tmp/levels-test",
});

async function connect(discover: () => Discovery, preload = true) {
  const levels = createLevelsServer({ client: new LevelsClient({ discover }), version: "1.2.3" });
  if (preload) await levels.refreshTools();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([levels.server.connect(st), client.connect(ct)]);
  return { levels, client };
}

let fake: Fake;
beforeEach(async () => { fake = await startFake(); });
afterEach(async () => { await fake.close(); });

describe("LevelsClient", () => {
  it("lists tools and calls one", async () => {
    const c = new LevelsClient({ discover: disc(fake.port) });
    expect((await c.listTools()).map((t) => t.name)).toEqual(["get_status", "log_progress"]);
    const r = await c.callTool("log_progress", { habit_id: "gym", delta: 1 });
    expect(r.ok).toBe(true);
    expect(fake.calls.at(-1)).toEqual({ name: "log_progress", args: { habit_id: "gym", delta: 1 } });
  });

  it("maps 401 to a token-mismatch message", async () => {
    const c = new LevelsClient({ discover: disc(fake.port, "wrong") });
    await expect(c.listTools()).rejects.toMatchObject({ kind: "unauthorized", message: MSG_UNAUTHORIZED });
    expect(MSG_UNAUTHORIZED).toMatch(/token mismatch: restart Levels and the MCP server/);
  });

  it("maps ECONNREFUSED to 'Levels is not running'", async () => {
    const c = new LevelsClient({ discover: disc(await freePort()) });
    await expect(c.listTools()).rejects.toMatchObject({ kind: "not_running", message: MSG_NOT_RUNNING });
    expect(MSG_NOT_RUNNING).toMatch(/Levels is not running/);
  });

  it("times out", async () => {
    const hang = (await import("node:http")).createServer(() => {});
    await new Promise<void>((r) => hang.listen(0, "127.0.0.1", r));
    const port = (hang.address() as { port: number }).port;
    const c = new LevelsClient({ discover: disc(port), timeoutMs: 100 });
    await expect(c.listTools()).rejects.toMatchObject({ kind: "timeout" });
    hang.closeAllConnections();
    hang.close();
  });
});

describe("toCallToolResult", () => {
  it("maps ok/data/error", () => {
    expect(toCallToolResult({ ok: true, content: "hi", data: { a: 1 } })).toEqual({
      content: [{ type: "text", text: "hi" }], isError: false, structuredContent: { a: 1 },
    });
    expect(toCallToolResult({ ok: true, content: "x", data: [1, 2] }).structuredContent).toEqual({ result: [1, 2] });
    const err = toCallToolResult({ ok: false, content: "No.", error: "bad" });
    expect(err.isError).toBe(true);
    expect(err.structuredContent).toBeUndefined();
    expect((err.content[0] as { text: string }).text).toContain("bad");
  });
});

describe("MCP server (in-memory end to end)", () => {
  it("registers one MCP tool per app ToolDef with raw JSON schemas", async () => {
    const { client } = await connect(disc(fake.port));
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(FAKE_TOOLS.length);
    const lp = tools.find((t) => t.name === "log_progress")!;
    expect(lp.inputSchema).toEqual(FAKE_TOOLS[1].inputSchema);
    expect(lp.annotations?.readOnlyHint).toBe(false);
    expect(client.getServerVersion()).toMatchObject({ name: "levels", version: "1.2.3" });
  });

  it("round-trips tools/call to content/structuredContent/isError", async () => {
    const { client } = await connect(disc(fake.port));
    const ok = await client.callTool({ name: "log_progress", arguments: { habit_id: "gym", delta: 2 } });
    expect(ok.isError).toBe(false);
    expect(ok.structuredContent).toEqual({ xp: 10 });
    expect((ok.content as { text: string }[])[0].text).toMatch(/^Logged 2 on gym\./);
    const bad = await client.callTool({ name: "log_progress", arguments: { habit_id: "nope" } });
    expect(bad.isError).toBe(true);
    expect((bad.content as { text: string }[])[0].text).toContain("unknown habit_id");
    const unknown = await client.callTool({ name: "nope_tool", arguments: {} });
    expect(unknown.isError).toBe(true);
  });

  it("returns token-mismatch as a tool error", async () => {
    const { client } = await connect(disc(fake.port, "wrong"));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([STATUS_TOOL]);
    const r = await client.callTool({ name: STATUS_TOOL, arguments: {} });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0].text).toContain("token mismatch");
  });

  it("starts with levels_status when the app is down, then picks the app up lazily", async () => {
    let port = await freePort();
    const { client } = await connect(() => disc(port)(), true);
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([STATUS_TOOL]);
    const down = await client.callTool({ name: STATUS_TOOL, arguments: {} });
    expect(down.isError).toBe(true);
    expect((down.content as { text: string }[])[0].text).toMatch(/Levels is not running — open the app/);
    const proxied = await client.callTool({ name: "get_status", arguments: {} });
    expect((proxied.content as { text: string }[])[0].text).toMatch(/Levels is not running/);

    // "Open the app": point discovery at the fake server.
    let notified = false;
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => { notified = true; });
    port = fake.port;
    const up = await client.callTool({ name: STATUS_TOOL, arguments: {} });
    expect(up.isError).toBeFalsy();
    expect(up.structuredContent).toMatchObject({ running: true, version: "9.9.9" });
    await new Promise((r) => setTimeout(r, 20));
    expect(notified).toBe(true);
    expect((await client.listTools()).tools).toHaveLength(2);
  });

  it("lists and reads resources", async () => {
    const { client } = await connect(disc(fake.port));
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual(["levels://status", "levels://today", "levels://config"]);
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((t) => t.uriTemplate)).toEqual(["levels://history/{days}"]);
    const status = await client.readResource({ uri: "levels://status" });
    expect(status.contents[0]).toMatchObject({ uri: "levels://status", mimeType: "application/json" });
    expect(JSON.parse((status.contents[0] as { text: string }).text)).toEqual({ level: 7, rank: "E" });
    const hist = await client.readResource({ uri: "levels://history/7" });
    expect(JSON.parse((hist.contents[0] as { text: string }).text)[0].days).toBe(7);
    expect(fake.calls.at(-1)).toEqual({ name: "get_history", args: { days: 7 } });
    await expect(client.readResource({ uri: "levels://history/500" })).rejects.toThrow(/between 1 and 90/);
  });

  it("lists and renders prompts", async () => {
    const { client } = await connect(disc(fake.port));
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(["log-day", "weekly-review", "plan-my-day"]);
    const log = await client.getPrompt({ name: "log-day", arguments: { text: "gym done, 40 min study" } });
    const text = (log.messages[0].content as { text: string }).text;
    expect(text).toContain("log_text");
    expect(text).toContain("apply: true");
    expect(text).toContain("gym done, 40 min study");
    const wr = await client.getPrompt({ name: "weekly-review" });
    expect((wr.messages[0].content as { text: string }).text).toContain("propose_targets");
    const plan = await client.getPrompt({ name: "plan-my-day" });
    expect((plan.messages[0].content as { text: string }).text).toContain("get_today");
  });
});
