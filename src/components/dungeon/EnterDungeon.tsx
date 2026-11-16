/**
 * Enter Dungeon dialog: name the boss, pick a duration the rank allows, link a minutes goal and choose a key
 * (or go keyless: E-rank, half rewards). ENTER dispatches DUNGEON_STARTED; the engine's `dungeonEntered`
 * window then arrives through the normal popup path.
 */
import { useEffect, useState } from "react";
import { selectors, type HunterRank, type State } from "../../engine";
import { dispatch, gameStore, useGame } from "../../store/game";
import { useUi } from "../../store/ui";
import { Btn, Panel } from "../ui/kit";

const KEYLESS = "";

interface Draft { boss: string; minutes: number; linkId: string; keyId: string }

function initialDraft(s: State, keyId?: string): Draft {
  const keys = selectors.dungeonKeys(s);
  const key = keyId !== undefined ? keys.find((k) => k.item.id === keyId) : keys[0];
  const rank: HunterRank = key?.rank ?? "E";
  return {
    boss: selectors.defaultBossName(s),
    minutes: selectors.dungeonBoundsFor(rank).options[0] ?? selectors.dungeonBoundsFor(rank).min,
    linkId: selectors.defaultLinkGoal(s)?.id ?? "",
    keyId: key?.item.id ?? KEYLESS,
  };
}

export function EnterDungeon() {
  const dialog = useUi((u) => u.dungeonDialog);
  const close = useUi((u) => u.closeDungeonDialog);
  const s = useGame((g) => g.state);
  const [draft, setDraft] = useState<Draft | undefined>();

  useEffect(() => {
    const st = gameStore.getState().state; // seeded from the state at the moment the dialog opens
    setDraft(dialog && st ? initialDraft(st, dialog.keyId) : undefined);
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, close]);

  if (!dialog || !s || !draft) return null;
  const keys = selectors.dungeonKeys(s);
  const key = keys.find((k) => k.item.id === draft.keyId);
  const rank: HunterRank = key?.rank ?? "E";
  const bounds = selectors.dungeonBoundsFor(rank);
  const minutes = selectors.clampDungeonMinutes(rank, draft.minutes);
  const goals = selectors.linkableGoals(s);
  const open = !!s.dungeon;

  const enter = () => {
    if (open) return;
    dispatch({
      type: "DUNGEON_STARTED", rank, bossName: draft.boss.trim() || "Unnamed Boss", minutes,
      ...(key ? { keyItemId: key.item.id } : {}), ...(draft.linkId ? { linkGoalId: draft.linkId } : {}),
    });
    close();
  };

  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-[rgba(2,6,13,.7)] p-6" onClick={close}>
      <div className="w-full max-w-[560px]" role="dialog" aria-modal="true" aria-label="Enter dungeon" onClick={(e) => e.stopPropagation()} data-testid="enter-dungeon">
        <Panel title={`${rank}-Rank Instant Dungeon`} accent="purple" right={<button className="sys-close !static" aria-label="Close" onClick={close}>&times;</button>}>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); enter(); }}>
            <label className="grid gap-1.5">
              <span className="sub">Boss (what you will work on)</span>
              <input className="sys-input w-full" autoFocus maxLength={60} value={draft.boss} onChange={(e) => setDraft({ ...draft, boss: e.target.value })} placeholder="Chapter 3 problem set" aria-label="Boss name" />
            </label>
            <div className="grid gap-1.5">
              <span className="sub">Duration</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Duration">
                {[25, 50, 90].map((m) => {
                  const allowed = bounds.options.includes(m);
                  return (
                    <Btn key={m} type="button" sm primary={allowed && minutes === m} disabled={!allowed} role="radio" aria-checked={minutes === m}
                      title={allowed ? undefined : `${rank}-rank dungeons last ${bounds.min === bounds.max ? bounds.min : `${bounds.min}–${bounds.max}`} min`}
                      onClick={() => setDraft({ ...draft, minutes: m })}>{m} min</Btn>
                  );
                })}
              </div>
            </div>
            <label className="grid gap-1.5">
              <span className="sub">Key</span>
              <select className="sys-input w-full" aria-label="Dungeon key" value={draft.keyId}
                onChange={(e) => { const k = keys.find((x) => x.item.id === e.target.value); setDraft({ ...draft, keyId: e.target.value, minutes: selectors.dungeonBoundsFor(k?.rank ?? "E").options[0] ?? 25 }); }}>
                {keys.map((k) => <option key={k.item.id} value={k.item.id}>{k.item.name} · {k.rank}-rank</option>)}
                <option value={KEYLESS}>No key — E-rank, half rewards</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="sub">Link to goal (minutes count toward it)</span>
              <select className="sys-input w-full" aria-label="Link to goal" value={draft.linkId} onChange={(e) => setDraft({ ...draft, linkId: e.target.value })}>
                <option value="">No link</option>
                {goals.map((g) => <option key={g.id} value={g.id}>{g.label} · {g.current}/{g.target} {g.unit}{g.done ? " ✓" : ""}</option>)}
              </select>
            </label>
            <p className="copy dim m-0">
              Stay inside until the timer ends, then claim the victory. Reward: XP +{Math.round((["E", "D", "C", "B", "A", "S"].indexOf(rank) + 1) * 40 * (key ? 1 : 0.5))}.
              {!key && " No key: half rewards."}
            </p>
            {open && <p className="tone-red m-0">A dungeon is already open.</p>}
            <div className="sys-actions">
              <Btn type="button" onClick={close}>[CANCEL]</Btn>
              <Btn type="submit" primary disabled={open} data-testid="dungeon-enter">[ENTER]</Btn>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}
