import { discover as defaultDiscover, type Discovery } from "./discovery.js";
import type { Health, ToolDef, ToolResult } from "./types.js";

export const HTTP_TIMEOUT_MS = 20_000;

export type LevelsErrorKind = "not_running" | "unauthorized" | "timeout" | "not_found" | "http" | "bad_response";

export const MSG_NOT_RUNNING = "Levels is not running — open the app, then try again.";
export const MSG_UNAUTHORIZED = "Levels API token mismatch: restart Levels and the MCP server.";

export class LevelsError extends Error {
  constructor(public readonly kind: LevelsErrorKind, message: string) {
    super(message);
    this.name = "LevelsError";
  }
}

export interface LevelsClientOptions {
  /** Re-run on every request so a restarted app (new port/token) is picked up. */
  discover?: () => Discovery;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

function errCode(e: unknown): string | undefined {
  let cur: any = e;
  for (let i = 0; cur && i < 5; i++) {
    if (typeof cur.code === "string") return cur.code;
    if (Array.isArray(cur.errors)) {
      const inner = cur.errors.map(errCode).find(Boolean);
      if (inner) return inner;
    }
    cur = cur.cause;
  }
  return undefined;
}

/** Thin HTTP client for the Rust localhost API (see src/agent/contract.ts). */
export class LevelsClient {
  private readonly discoverFn: () => Discovery;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(opts: LevelsClientOptions = {}) {
    this.discoverFn = opts.discover ?? (() => defaultDiscover());
    this.timeoutMs = opts.timeoutMs ?? HTTP_TIMEOUT_MS;
    this.fetchFn = opts.fetch ?? fetch;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown, auth = true): Promise<T> {
    const d = this.discoverFn();
    const headers: Record<string, string> = { accept: "application/json" };
    if (auth && d.token) headers.authorization = `Bearer ${d.token}`;
    if (body !== undefined) headers["content-type"] = "application/json";

    let res: Response;
    try {
      res = await this.fetchFn(d.baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === "TimeoutError" || name === "AbortError") {
        throw new LevelsError("timeout", `Levels did not answer within ${Math.round(this.timeoutMs / 1000)} s (${method} ${path}).`);
      }
      const code = errCode(e);
      if (code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH" || code === "ENOTFOUND" || !code) {
        throw new LevelsError("not_running", MSG_NOT_RUNNING);
      }
      throw new LevelsError("http", `Could not reach Levels (${code}).`);
    }

    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel().catch(() => {});
      throw new LevelsError("unauthorized", d.token ? MSG_UNAUTHORIZED : `No Levels API token found in ${d.dataDir}. ${MSG_UNAUTHORIZED}`);
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (res.status === 404) {
      throw new LevelsError("not_found", `Not found: ${method} ${path}${errorDetail(json)}`);
    }
    if (res.status === 504) {
      throw new LevelsError("timeout", `Levels app did not respond in time (is the window frozen?)${errorDetail(json)}`);
    }
    if (!res.ok) {
      throw new LevelsError("http", `Levels API error ${res.status} on ${method} ${path}${errorDetail(json)}`);
    }
    if (json === undefined) throw new LevelsError("bad_response", `Levels returned a non-JSON response for ${method} ${path}.`);
    return json as T;
  }

  health(): Promise<Health> {
    return this.request<Health>("GET", "/v1/health", undefined, false);
  }

  async listTools(): Promise<ToolDef[]> {
    const tools = await this.request<unknown>("GET", "/v1/tools");
    if (!Array.isArray(tools)) throw new LevelsError("bad_response", "GET /v1/tools did not return an array.");
    return tools.filter(
      (t): t is ToolDef => !!t && typeof t === "object" && typeof (t as ToolDef).name === "string",
    );
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const r = await this.request<ToolResult>("POST", `/v1/tools/${encodeURIComponent(name)}`, { args });
    if (!r || typeof r !== "object" || typeof r.ok !== "boolean") {
      throw new LevelsError("bad_response", `Levels returned a malformed result for ${name}.`);
    }
    return r;
  }
}

function errorDetail(json: unknown): string {
  if (json && typeof json === "object") {
    const o = json as { error?: unknown; content?: unknown; message?: unknown };
    const msg = o.error ?? o.message ?? o.content;
    if (typeof msg === "string" && msg) return `: ${msg}`;
  }
  return "";
}
