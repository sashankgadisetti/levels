#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LevelsClient } from "./client.js";
import { discover } from "./discovery.js";
import { createLevelsServer } from "./server.js";

function pkgVersion(): string {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// stdout is the MCP channel — diagnostics go to stderr only, and never include the token.
const log = (msg: string) => process.stderr.write(`[levels-mcp] ${msg}\n`);

async function main() {
  const d = discover();
  log(`API ${d.baseUrl} (data dir ${d.dataDir}; token ${d.token ? "found" : "missing"})`);

  const levels = createLevelsServer({ client: new LevelsClient(), version: pkgVersion(), log });
  if (!(await levels.refreshTools())) {
    log(`starting without app tools; exposing levels_status and retrying on each call`);
  }

  const transport = new StdioServerTransport();
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await levels.server.close().catch(() => {});
    process.exit(0);
  };
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await levels.server.connect(transport);
}

main().catch((e) => {
  log(`fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
