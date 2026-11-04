import { EVENTS, listen, SYSTEM_ACTION_EVENT } from "../lib/tauri";
import { handleAction } from "./actions";
import { gameStore } from "./game";
import { useUi } from "./ui";
import type { SystemActionEvent } from "../system/spec";

/** TICK every 60 s + on focus / visibility. Returns a cleanup. */
export function startScheduler(tickMs = 60_000): () => void {
  const tick = () => gameStore.getState().dispatch({ type: "TICK" });
  const id = setInterval(tick, tickMs);
  const onVis = () => { if (document.visibilityState === "visible") tick(); };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", tick);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("focus", tick);
  };
}

/** Main window: actions from the System pop-up window + tray navigation events. */
export function startBridges(): () => void {
  const subs = [
    listen<SystemActionEvent>(SYSTEM_ACTION_EVENT, (p) => p?.action && handleAction(p.action)),
    listen(EVENTS.openStatus, () => useUi.getState().setScreen("status")),
    listen(EVENTS.toggleStatus, () => useUi.getState().setScreen("status")),
    listen(EVENTS.showDailyQuest, () => useUi.getState().setScreen("daily")),
  ];
  return () => { subs.forEach((p) => p.then((un) => un())); };
}
