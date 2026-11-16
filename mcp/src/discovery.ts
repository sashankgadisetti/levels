import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Bundle identifier of the Tauri app; the app data dir is named after it. */
export const APP_ID = "dev.levels.app";
/** Must match DEFAULT_API_PORT in src/agent/contract.ts. */
export const DEFAULT_API_PORT = 41414;

export interface Discovery {
  /** Base URL of the localhost API, e.g. http://127.0.0.1:41414 */
  baseUrl: string;
  port: number;
  /** Bearer token; undefined when no token file / env var was found. Never log this. */
  token?: string;
  dataDir: string;
}

type Env = Record<string, string | undefined>;

/** OS-specific app data dir (mirrors Tauri's appDataDir for APP_ID). */
export function appDataDir(
  env: Env = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (env.LEVELS_DATA_DIR) return env.LEVELS_DATA_DIR;
  switch (platform) {
    case "darwin":
      return join(home, "Library", "Application Support", APP_ID);
    case "win32":
      return join(env.APPDATA || join(home, "AppData", "Roaming"), APP_ID);
    default:
      return join(env.XDG_DATA_HOME || join(home, ".local", "share"), APP_ID);
  }
}

function readTrimmed(path: string): string | undefined {
  try {
    const v = readFileSync(path, "utf8").trim();
    return v || undefined;
  } catch {
    return undefined;
  }
}

function parsePort(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : undefined;
}

/**
 * Resolve port + token. Env overrides (LEVELS_API_PORT, LEVELS_API_TOKEN, LEVELS_DATA_DIR) win over
 * the discovery files. Cheap enough to call before every request, so a restarted app (new port/token)
 * is picked up without restarting the MCP server.
 */
export function discover(env: Env = process.env, platform: NodeJS.Platform = process.platform): Discovery {
  const dataDir = appDataDir(env, platform);
  const port =
    parsePort(env.LEVELS_API_PORT) ?? parsePort(readTrimmed(join(dataDir, "mcp-port"))) ?? DEFAULT_API_PORT;
  const token = env.LEVELS_API_TOKEN?.trim() || readTrimmed(join(dataDir, "mcp-token"));
  return { baseUrl: `http://127.0.0.1:${port}`, port, token, dataDir };
}
