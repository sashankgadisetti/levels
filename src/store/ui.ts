import { create } from "zustand";

export const SCREENS = ["daily", "status", "shop", "inventory", "shadows", "titles", "settings"] as const;
export type Screen = (typeof SCREENS)[number];
export const SCREEN_LABEL: Record<Screen, string> = {
  daily: "Daily Quest", status: "Status", shop: "Shop", inventory: "Inventory", shadows: "Shadows", titles: "Titles & Skills", settings: "Settings",
};

const SCREEN_KEY = "levels.screen";
const HELP_KEY = "levels.helpSeen";

const lsGet = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode etc. */ } };

/** Last visited screen, defaulting to the Daily Quest. */
export function initialScreen(): Screen {
  const v = lsGet(SCREEN_KEY);
  return (SCREENS as readonly string[]).includes(v ?? "") ? (v as Screen) : "daily";
}

export const useUi = create<{
  screen: Screen;
  setScreen(s: Screen): void;
  toast?: { id: number; text: string };
  showToast(text: string): void;
  /** "How it works" modal (opened from the nav footer). */
  helpOpen: boolean;
  setHelpOpen(v: boolean): void;
  /** The first-run hint card on the Daily Quest screen. */
  helpSeen: boolean;
  markHelpSeen(): void;
}>((set) => ({
  screen: initialScreen(),
  setScreen: (screen) => { lsSet(SCREEN_KEY, screen); set({ screen }); },
  showToast(text) {
    const id = Date.now();
    set({ toast: { id, text } });
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: undefined } : s)), 2600);
  },
  helpOpen: false,
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  helpSeen: lsGet(HELP_KEY) === "1",
  markHelpSeen: () => { lsSet(HELP_KEY, "1"); set({ helpSeen: true }); },
}));
