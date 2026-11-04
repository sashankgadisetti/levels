/** Sizing/anchoring of the always-on-top Tauri "system" window around its rendered content. Never focuses the window. */
import { isTauri } from "./tauri";

export const POPUP_MIN = { w: 360, h: 160 };
export const POPUP_MAX = { w: 560, h: 700 };
export const POPUP_MARGIN = 24;
/** Transparent padding around the System window inside the webview (px, each side): room for the glow. */
export const POPUP_PAD = 12;

export const clampSize = (w: number, h: number) => ({
  w: Math.round(Math.min(POPUP_MAX.w, Math.max(POPUP_MIN.w, w))),
  h: Math.round(Math.min(POPUP_MAX.h, Math.max(POPUP_MIN.h, h))),
});

let last = { w: 0, h: 0 };

/** Resize the OS window to `w` x `h` logical px and keep it pinned to the top-right of its monitor. */
export async function fitSystemWindow(w: number, h: number): Promise<void> {
  if (!isTauri()) return;
  const size = clampSize(w, h);
  if (Math.abs(size.w - last.w) < 2 && Math.abs(size.h - last.h) < 2) return;
  last = size;
  try {
    const api = await import("@tauri-apps/api/window");
    const win = api.getCurrentWindow();
    await win.setSize(new api.LogicalSize(size.w, size.h));
    const mon = (await api.currentMonitor()) ?? (await api.primaryMonitor());
    if (!mon) return;
    const scale = mon.scaleFactor;
    const pos = mon.position.toLogical(scale);
    const msize = mon.size.toLogical(scale);
    await win.setPosition(new api.LogicalPosition(pos.x + msize.width - size.w - POPUP_MARGIN, pos.y + POPUP_MARGIN));
  } catch (err) {
    console.warn("[system] resize failed", err);
  }
}
