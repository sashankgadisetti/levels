import { create } from "zustand";

export const SCREENS = ["status", "daily", "shop", "inventory", "shadows", "titles", "settings"] as const;
export type Screen = (typeof SCREENS)[number];
export const SCREEN_LABEL: Record<Screen, string> = {
  status: "Status", daily: "Daily Quest", shop: "Shop", inventory: "Inventory", shadows: "Shadows", titles: "Titles & Skills", settings: "Settings",
};

export const useUi = create<{
  screen: Screen;
  setScreen(s: Screen): void;
  toast?: { id: number; text: string };
  showToast(text: string): void;
}>((set) => ({
  screen: "status",
  setScreen: (screen) => set({ screen }),
  showToast(text) {
    const id = Date.now();
    set({ toast: { id, text } });
    setTimeout(() => set((s) => (s.toast?.id === id ? { toast: undefined } : s)), 2600);
  },
}));
