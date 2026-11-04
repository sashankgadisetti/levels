import type { UnlistenFn } from "@tauri-apps/api/event";

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** invoke a Rust command; resolves to undefined outside Tauri. */
export async function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!isTauri()) return undefined;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** listen to a Tauri event; returns a no-op unlisten outside Tauri. */
export async function listen<T = unknown>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, (e) => handler(e.payload));
}

export const EVENTS = {
  toggleStatus: "levels://toggle-status",
  systemWindow: "levels://system-window",
  openStatus: "levels://open-status",
  showDailyQuest: "levels://show-daily-quest",
} as const;

export const showSystemWindow = (payload: unknown) => invoke("show_system_window", { payload });
export const hideSystemWindow = () => invoke("hide_system_window");
