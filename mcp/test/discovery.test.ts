import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appDataDir, DEFAULT_API_PORT, discover } from "../src/discovery.js";

describe("discovery", () => {
  it("resolves the app data dir per OS", () => {
    expect(appDataDir({}, "darwin", "/Users/u")).toBe(join("/Users/u", "Library", "Application Support", "dev.levels.app"));
    expect(appDataDir({}, "linux", "/home/u")).toBe(join("/home/u", ".local", "share", "dev.levels.app"));
    expect(appDataDir({ XDG_DATA_HOME: "/xdg" }, "linux", "/home/u")).toBe(join("/xdg", "dev.levels.app"));
    expect(appDataDir({ APPDATA: "C:\\Users\\u\\AppData\\Roaming" }, "win32", "C:\\Users\\u")).toContain("dev.levels.app");
    expect(appDataDir({ LEVELS_DATA_DIR: "/custom" }, "linux", "/home/u")).toBe("/custom");
  });

  it("reads mcp-port and mcp-token from the data dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "levels-"));
    writeFileSync(join(dir, "mcp-port"), "51234\n");
    writeFileSync(join(dir, "mcp-token"), "deadbeef\n");
    const d = discover({ LEVELS_DATA_DIR: dir }, "linux");
    expect(d).toMatchObject({ port: 51234, token: "deadbeef", baseUrl: "http://127.0.0.1:51234", dataDir: dir });
  });

  it("env overrides win; port falls back to the default", () => {
    const dir = mkdtempSync(join(tmpdir(), "levels-"));
    writeFileSync(join(dir, "mcp-port"), "51234");
    writeFileSync(join(dir, "mcp-token"), "filetoken");
    expect(discover({ LEVELS_DATA_DIR: dir, LEVELS_API_PORT: "6000", LEVELS_API_TOKEN: "envtoken" }, "linux"))
      .toMatchObject({ port: 6000, token: "envtoken" });
    const empty = mkdtempSync(join(tmpdir(), "levels-"));
    const d = discover({ LEVELS_DATA_DIR: empty }, "linux");
    expect(d.port).toBe(DEFAULT_API_PORT);
    expect(d.token).toBeUndefined();
  });
});
