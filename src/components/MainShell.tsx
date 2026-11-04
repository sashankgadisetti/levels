import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect } from "react";
import { questProgress, rankLabel, vitalMax } from "../lib/derive";
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
import { HowItWorksModal } from "./HowItWorks";
import { Btn, Meter } from "./ui/kit";

const VIEWS: Record<Screen, () => React.ReactElement> = {
  status: Status, daily: DailyQuest, shop: Shop, inventory: Inventory, shadows: Shadows, titles: TitlesSkills, settings: Settings,
};

/** Cmd/Ctrl+K: jump to the Daily Quest and focus the quick-log field of the first unfinished goal. */
function focusQuickLog() {
  useUi.getState().setScreen("daily");
  let tries = 0;
  const go = () => {
    const el = document.querySelector<HTMLInputElement>('main [data-testid^="goal-"]:not(.done) input[data-quicklog]');
    if (el) { el.focus(); el.scrollIntoView({ block: "center", behavior: "smooth" }); }
    else if (tries++ < 10) setTimeout(go, 60);
  };
  setTimeout(go, 60);
}

let initPromise: Promise<void> | undefined;

export function MainShell() {
  const ready = useGame((s) => s.ready);
  const error = useGame((s) => s.error);
  const state = useGame((s) => s.state);
  const screen = useUi((u) => u.screen);
  const setScreen = useUi((u) => u.setScreen);
  const toast = useUi((u) => u.toast);
  const setHelp = useUi((u) => u.setHelpOpen);

  useEffect(() => {
    initPromise ??= gameStore.getState().init();
    const stopTick = startScheduler();
    const stopBridge = startBridges();
    return () => { stopTick(); stopBridge(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusQuickLog();
        return;
      }
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
  const prog = questProgress(state?.today);

  return (
    <MotionConfig reducedMotion="user">
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
          <header className="relative z-10 flex items-center gap-x-5 border-b border-[rgba(63,216,255,.3)] bg-[rgba(2,6,13,.7)] px-5 py-2 backdrop-blur">
            <h1 className="m-0 font-[family-name:var(--font-head)] text-[15px] tracking-[0.3em] text-[var(--sl-cyan)]" style={{ textShadow: "0 0 12px var(--sl-cyan)" }}>LEVELS</h1>
            <div className="flex items-baseline gap-2.5 whitespace-nowrap">
              <span className="max-w-[140px] truncate text-[17px] font-semibold">{state.player.name}</span>
              <span className="mono tone-cyan text-[15px]" data-testid="lv">LV {state.player.level} &middot; {rankLabel(state.player.rank)}-RANK</span>
            </div>
            <Meter label="HP" value={state.vitals.hp} max={max!.hp} tone="red" />
            <Meter label="MP" value={state.vitals.mp} max={max!.mp} tone="blue" />
            <Meter label="XP" value={state.player.xp} max={state.player.xpToNext} tone="purple" title={`XP ${state.player.xp} / ${state.player.xpToNext} to level ${state.player.level + 1}`} />
            <div className="ml-auto flex items-center gap-3">
              <button className={`pill ${prog.total > 0 && prog.done === prog.total ? "ok" : ""}`} onClick={() => setScreen("daily")} aria-label={`Today's goals: ${prog.done} of ${prog.total} done. Open the Daily Quest`} data-testid="today-pill">
                {prog.total > 0 && prog.done === prog.total ? "\u2713 " : ""}today: {prog.done}/{prog.total}
              </button>
              <div className="mono tone-gold glow-gold text-[18px]" data-testid="gold">{state.gold} G</div>
            </div>
          </header>
          {state.penalty && !state.penalty.cleared && (
            <div className="relative z-10 border-b border-[var(--sl-red)] bg-[rgba(255,59,92,.12)] py-1 text-center text-[15px] tone-red">&#9888; Penalty active: clear a missed goal to survive</div>
          )}
          <div className="relative z-10 flex min-h-0 flex-1">
            <nav className="flex w-56 flex-none flex-col gap-1 border-r border-[rgba(63,216,255,.2)] bg-[rgba(2,6,13,.55)] p-3" aria-label="Screens">
              {SCREENS.map((id, i) => (
                <button key={id} className={`nav-btn ${screen === id ? "on" : ""}`} onClick={() => setScreen(id)} aria-current={screen === id ? "page" : undefined}>
                  <span>{SCREEN_LABEL[id]}</span><span className="mono sub !text-[12px]">{i + 1}</span>
                </button>
              ))}
              <div className="nav-foot">
                <button className="nav-btn" onClick={() => routeEffects([{ kind: "popup", spec: SystemWindowSpec.parse(statusSpec(state)) }])}>System window</button>
                <button className="nav-btn" onClick={() => setHelp(true)} aria-label="How it works" title="How it works"><span>How it works</span><span className="mono sub !text-[13px]">?</span></button>
              </div>
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
      <HowItWorksModal />
      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 border border-[var(--sl-cyan)] bg-[var(--sl-panel)] px-5 py-2 text-[16px] tone-cyan" style={{ boxShadow: "0 0 18px rgba(63,216,255,.35)" }}>{toast.text}</div>}
    </div>
    </MotionConfig>
  );
}
