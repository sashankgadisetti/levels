/** Device-local UI settings + the Oracle API key. The key is read by src/oracle via getOracleApiKey(). */
import { create } from "zustand";
import { isTauri } from "../lib/tauri";

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

export async function getOracleApiKey(): Promise<string | undefined> {
  if (isTauri()) {
    try {
      const v = await (await tauriStore()).get<string>(API_KEY);
      if (v) return v;
    } catch { /* fall through */ }
  }
  try { return localStorage.getItem(API_KEY) || undefined; } catch { return undefined; }
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
