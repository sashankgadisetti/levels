import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { rankLabel, vitalMax } from "../lib/derive";
import { statusSpec } from "../lib/specs";
import { routeEffects } from "../store/effects";
import { gameStore, useGame } from "../store/game";
import { startBridges, startScheduler } from "../store/scheduler";
import { SCREENS, SCREEN_LABEL, useUi, type Screen } from "../store/ui";
import { SystemWindowSpec } from "../system/spec";
import { PopupLayer } from "./PopupLayer";
import { Starfield } from "./Starfield";
import { DailyQuest } from "./screens/DailyQuest";
import { Inventory } from "./screens/Inventory";
import { Onboarding } from "./screens/Onboarding";
import { Settings } from "./screens/Settings";
import { Shadows } from "./screens/Shadows";
import { Shop } from "./screens/Shop";
import { Status } from "./screens/Status";
import { TitlesSkills } from "./screens/TitlesSkills";
import { Btn, Rank, SBar } from "./ui/kit";

const VIEWS: Record<Screen, () => React.ReactElement> = {
  status: Status, daily: DailyQuest, shop: Shop, inventory: Inventory, shadows: Shadows, titles: TitlesSkills, settings: Settings,
};

let initPromise: Promise<void> | undefined;

export function MainShell() {
  const ready = useGame((s) => s.ready);
  const error = useGame((s) => s.error);
  const state = useGame((s) => s.state);
  const screen = useUi((u) => u.screen);
  const setScreen = useUi((u) => u.setScreen);
  const toast = useUi((u) => u.toast);

  useEffect(() => {
    initPromise ??= gameStore.getState().init();
    const stopTick = startScheduler();
    const stopBridge = startBridges();
    return () => { stopTick(); stopBridge(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= SCREENS.length) setScreen(SCREENS[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setScreen]);

  const View = VIEWS[screen];
  const accepted = !!state?.player.accepted;
  const max = state ? vitalMax(state) : undefined;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <Starfield />
      <div className="screen-scan" />
      <PopupLayer />
      {!ready ? (
        <div className="relative z-10 grid flex-1 place-items-center"><p className="mono tone-cyan">[LOADING DATA...]</p></div>
      ) : error || !state ? (
        <div className="relative z-10 grid flex-1 place-items-center p-8">
          <div className="sys max-w-[520px] text-center" data-variant="penalty">
            <h2 className="sys-title">[SYSTEM ERROR]</h2><hr className="sys-rule" />
            <p className="sys-text normal-case">{error ?? "No state available."}</p>
            <div className="sys-actions"><Btn onClick={() => location.reload()}>[RETRY]</Btn></div>
          </div>
        </div>
      ) : !accepted ? (
        <Onboarding />
      ) : (
        <>
          <header className="relative z-10 flex items-center gap-6 border-b border-[rgba(63,216,255,.3)] bg-[rgba(2,6,13,.7)] px-5 py-2.5 backdrop-blur">
            <h1 className="m-0 font-[family-name:var(--font-head)] text-[16px] tracking-[0.3em] text-[var(--sl-cyan)]" style={{ textShadow: "0 0 12px var(--sl-cyan)" }}>LEVELS</h1>
            <div className="flex items-center gap-3 text-[17px]">
              <span className="mono">{state.player.name}</span>
              <span className="mono tone-cyan">LV {state.player.level}</span>
              <Rank rank={rankLabel(state.player.rank)} size="sm" />
            </div>
            <div className="ml-4 w-48"><SBar value={state.vitals.hp} max={max!.hp} tone="red" thin label="HP" numbers={false} /></div>
            <div className="mono tone-gold glow-gold ml-auto text-[18px]" data-testid="gold">{state.gold} G</div>
            <Btn sm onClick={() => routeEffects([{ kind: "popup", spec: SystemWindowSpec.parse(statusSpec(state)) }])}>[OPEN SYSTEM WINDOW]</Btn>
          </header>
          {state.penalty && !state.penalty.cleared && (
            <div className="relative z-10 border-b border-[var(--sl-red)] bg-[rgba(255,59,92,.12)] py-1 text-center text-[14px] tone-red">&#9888; PENALTY ACTIVE — CLEAR A MISSED OBJECTIVE TO SURVIVE</div>
          )}
          <div className="relative z-10 flex min-h-0 flex-1">
            <nav className="flex w-56 flex-none flex-col gap-1 border-r border-[rgba(63,216,255,.2)] bg-[rgba(2,6,13,.55)] p-3" aria-label="Screens">
              {SCREENS.map((id, i) => (
                <button key={id} className={`nav-btn ${screen === id ? "on" : ""}`} onClick={() => setScreen(id)} aria-current={screen === id ? "page" : undefined}>
                  <span>{SCREEN_LABEL[id]}</span><span className="mono sub !text-[11px]">{i + 1}</span>
                </button>
              ))}
            </nav>
            <main className="min-w-0 flex-1 overflow-y-auto p-6" data-screen={screen}>
              <AnimatePresence mode="wait">
                <motion.div key={screen} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                  <View />
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </>
      )}
      {toast && <div className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 border border-[var(--sl-cyan)] bg-[var(--sl-panel)] px-5 py-2 text-[14px] tone-cyan" style={{ boxShadow: "0 0 18px rgba(63,216,255,.35)" }}>{toast.text}</div>}
    </div>
  );
}
