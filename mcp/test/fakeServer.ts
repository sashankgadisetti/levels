import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export const TOKEN = "a".repeat(64);

export const FAKE_TOOLS = [
  {
    name: "get_status",
    description: "Level, rank, stats.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    mutating: false,
  },
  {
    name: "log_progress",
    description: "Log numeric progress.",
    inputSchema: {
      type: "object",
      properties: { habit_id: { type: "string" }, delta: { type: "number" } },
      required: ["habit_id"],
      additionalProperties: false,
    },
    mutating: true,
  },
];

export interface Fake {
  port: number;
  calls: { name: string; args: unknown }[];
  close(): Promise<void>;
}

export async function startFake(): Promise<Fake> {
  const calls: Fake["calls"] = [];
  const srv: Server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/v1/health") return send(200, { ok: true, app: "levels", version: "9.9.9" });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: "unauthorized" });
    if (req.method === "GET" && req.url === "/v1/tools") return send(200, FAKE_TOOLS);
    const m = /^\/v1\/tools\/([^/]+)$/.exec(req.url ?? "");
    if (req.method === "POST" && m) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const name = decodeURIComponent(m[1]);
        const { args } = JSON.parse(raw || "{}");
        calls.push({ name, args });
        if (name === "get_status") return send(200, { ok: true, content: "Level 7, rank E.", data: { level: 7, rank: "E" } });
        if (name === "get_today") return send(200, { ok: true, content: "2 goals left.", data: { goals: [] } });
        if (name === "get_config") return send(200, { ok: true, content: "config", data: { habits: [] } });
        if (name === "get_history") return send(200, { ok: true, content: "history", data: [{ day: "2026-11-15", days: args?.days }] });
        if (name === "log_progress") {
          if (args?.habit_id === "nope") return send(200, { ok: false, content: "No such habit.", error: "unknown habit_id" });
          return send(200, { ok: true, content: `Logged ${args.delta} on ${args.habit_id}.`, data: { xp: 10 }, windowShown: true });
        }
        return send(404, { error: `unknown tool ${name}` });
      });
      return;
    }
    send(404, { error: "not found" });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as AddressInfo).port;
  return {
    port,
    calls,
    close: () => new Promise<void>((r) => { srv.closeAllConnections(); srv.close(() => r()); }),
  };
}

/** A port with nothing listening on it. */
export async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as AddressInfo).port;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}
