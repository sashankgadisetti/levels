/** Device-local UI settings + the Oracle API key. The key is read by src/oracle via getOracleApiKey(). */
import { create } from "zustand";
import { invoke, isTauri } from "../lib/tauri";

const KEY = "levels.settings";
const API_KEY = "oracle.apiKey";

export interface Settings { muted: boolean; volume: number }
const DEFAULTS: Settings = { muted: false, volume: 0.8 };

function read(): Settings {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) }; } catch { return DEFAULTS; }
}

export const useSettings = create<Settings & { set(p: Partial<Settings>): void }>((set, get) => ({
  ...read(),
  set(p) {
    set(p);
    const { muted, volume } = get();
    try { localStorage.setItem(KEY, JSON.stringify({ muted, volume })); } catch { /* ignore */ }
  },
}));

async function tauriStore() {
  const { load } = await import("@tauri-apps/plugin-store");
  return load("settings.json", { autoSave: true, defaults: {} });
}

export type ApiKeySource = "settings" | "env" | "file" | "none";
let lastKeySource: ApiKeySource = "none";
/** Where the key currently in use came from (for the Settings screen). */
export const oracleKeySource = (): ApiKeySource => lastKeySource;

export async function getOracleApiKey(): Promise<string | undefined> {
  if (isTauri()) {
    try {
      const v = await (await tauriStore()).get<string>(API_KEY);
      if (v) { lastKeySource = "settings"; return v; }
    } catch { /* fall through */ }
  }
  try {
    const v = localStorage.getItem(API_KEY);
    if (v) { lastKeySource = "settings"; return v; }
  } catch { /* ignore */ }
  // Fallback (desktop only): ANTHROPIC_API_KEY in the environment, or <appDataDir>/anthropic-key.
  if (isTauri()) {
    try {
      const fb = await invoke<{ key: string; source: "env" | "file" } | null>("fallback_api_key");
      if (fb?.key) { lastKeySource = fb.source; return fb.key; }
    } catch { /* ignore */ }
  }
  lastKeySource = "none";
  return undefined;
}

export async function setOracleApiKey(key: string): Promise<void> {
  const k = key.trim();
  try { if (k) localStorage.setItem(API_KEY, k); else localStorage.removeItem(API_KEY); } catch { /* ignore */ }
  if (isTauri()) {
    try {
      const s = await tauriStore();
      if (k) await s.set(API_KEY, k); else await s.delete(API_KEY);
      await s.save();
    } catch { /* ignore */ }
  }
}

export async function getAutostart(): Promise<boolean> {
  if (!isTauri()) return false;
  try { return await (await import("@tauri-apps/plugin-autostart")).isEnabled(); } catch { return false; }
}
export async function setAutostart(on: boolean): Promise<void> {
  if (!isTauri()) return;
  const m = await import("@tauri-apps/plugin-autostart");
  if (on) await m.enable(); else await m.disable();
}
