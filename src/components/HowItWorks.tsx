import { useEffect } from "react";
import { useGameState } from "../store/game";
import { useUi } from "../store/ui";
import { Btn, Panel } from "./ui/kit";

function Lines() {
  const s = useGameState();
  const end = s.config.player.dayEndsAt;
  const lines: [string, string][] = [
    ["Daily quest", "Log your goals as you go. Tap a chip like +15 or 7h, or press Done."],
    ["Rewards", "Clear every goal and XP, gold and a random box arrive right away."],
    ["Day ends", `Each day closes at ${end}. Whatever you logged by then is final.`],
    ["Penalty", `Miss a goal and a penalty quest starts. Make up the missed goals in time or you lose HP and streaks.`],
    ["Shop", "List something real you want, earn the gold, then buy it. Rewards you pay for stay yours."],
  ];
  return (
    <div className="grid gap-2.5">
      {lines.map(([k, v], i) => (
        <div key={k} className="helpline"><b>{i + 1}</b><p className="copy"><strong className="tone-cyan font-semibold">{k}.</strong> {v}</p></div>
      ))}
    </div>
  );
}

/** One-time hint card at the top of the Daily Quest screen after onboarding. */
export function HowItWorksCard() {
  const mark = useUi((u) => u.markHelpSeen);
  return (
    <Panel title="How it works" right={<Btn sm onClick={mark} aria-label="Dismiss how it works">Got it</Btn>}>
      <Lines />
    </Panel>
  );
}

/** Reopenable from the nav footer "?" button. */
export function HowItWorksModal() {
  const open = useUi((u) => u.helpOpen);
  const setOpen = useUi((u) => u.setHelpOpen);
  const mark = useUi((u) => u.markHelpSeen);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
  if (!open) return null;
  const close = () => { mark(); setOpen(false); };
  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-[rgba(2,6,13,.7)] p-6" onClick={close}>
      <div className="w-full max-w-[560px]" role="dialog" aria-modal="true" aria-label="How it works" onClick={(e) => e.stopPropagation()}>
        <Panel title="How it works" right={<button className="sys-close !static" aria-label="Close help" onClick={close}>&times;</button>}>
          <Lines />
          <div className="sys-actions"><Btn primary autoFocus onClick={close}>[GOT IT]</Btn></div>
        </Panel>
      </div>
    </div>
  );
}
