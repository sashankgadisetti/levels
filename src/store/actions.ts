/** Maps a System-window Action (from a pop-up button or in-block control) to events / navigation. */
import type { StatId } from "../engine";
import type { Action } from "../system/spec";
import { focusMainWindow } from "../lib/tauri";
import { gameStore } from "./game";
import { MORE_PREFIX } from "./cadence";
import { isSnoozeAction, recall, replayFolded, snooze } from "./snooze";
import { useUi, type Screen } from "./ui";

const OPEN: Record<string, Screen> = {
  "open:status": "status", "open:quest": "daily", "open:shop": "shop", "open:shadows": "shadows", "open:inventory": "inventory",
};

export function handleAction(action: Action, ctx: { windowId?: string } = {}): void {
  const { state, dispatch } = gameStore.getState();
  const ui = useUi.getState();
  if (OPEN[action.kind]) {
    ui.setScreen(OPEN[action.kind]);
    void focusMainWindow();
    return;
  }
  if (isSnoozeAction(action)) { snooze(recall(ctx.windowId)); return; }
  if (action.kind === "accept" && action.arg?.startsWith(MORE_PREFIX)) { replayFolded(action.arg); return; }
  if (!state) return;
  const goal = (id?: string) => state.today?.goals.find((g) => g.id === id);
  switch (action.kind) {
    case "progress:goal": {
      // goal ids look like "2026-11-04:gym", so the delta is whatever follows the LAST colon
      const arg = action.arg ?? "";
      const cut = arg.lastIndexOf(":");
      const id = arg.slice(0, cut);
      const g = goal(id);
      const delta = Number(arg.slice(cut + 1));
      if (!g || !Number.isFinite(delta) || delta === 0) return;
      if (delta > 0) dispatch({ type: "GOAL_PROGRESS", goalId: id, delta });
      else dispatch({ type: "GOAL_SET", goalId: id, value: Math.max(0, g.current + delta) });
      return;
    }
    case "answer:yes":
    case "answer:no":
      if (action.arg) dispatch({ type: "CHECKIN_ANSWERED", habitId: action.arg, yes: action.kind === "answer:yes" });
      return;
    case "complete:goal": {
      const g = goal(action.arg);
      if (g && !g.done) dispatch({ type: "GOAL_PROGRESS", goalId: g.id, delta: Math.max(1, g.target - g.current) });
      return;
    }
    case "allocate:points": {
      const stat = action.arg as StatId | undefined;
      if (stat && state.stats[stat] && state.player.abilityPoints > 0) dispatch({ type: "POINTS_ALLOCATED", stat, points: 1 });
      else { ui.setScreen("status"); void focusMainWindow(); }
      return;
    }
    case "open:box":
      if (state.boxes > 0) dispatch({ type: "BOX_OPENED", seed: Math.floor(Math.random() * 2 ** 31) });
      else { ui.setScreen("inventory"); void focusMainWindow(); }
      return;
    case "use:item":
      if (action.arg) dispatch({ type: "ITEM_USED", itemId: action.arg });
      return;
    case "extract:shadow": {
      const [stat, ...name] = (action.arg ?? "").split(":");
      if (state.stats[stat as StatId]) dispatch({ type: "SHADOW_EXTRACTED", stat: stat as StatId, name: name.join(":") || "Shadow" });
      else { ui.setScreen("shadows"); void focusMainWindow(); }
      return;
    }
    case "start:dungeon":
      ui.setScreen("daily"); void focusMainWindow();
      return;
    default:
      return; // dismiss / accept / decline: nothing to do
  }
}
