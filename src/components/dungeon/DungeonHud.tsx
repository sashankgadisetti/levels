/** Header HUD while an Instant Dungeon is open: "⚔ C-RANK · 23:14 · <boss>". Click re-opens the dungeon window. */
import { selectors, windows, type State } from "../../engine";
import { fmtHMS } from "../../lib/format";
import { useNow } from "../../lib/hooks";
import { routeEffects } from "../../store/effects";

/** "23:14" under an hour, "1:05:00" above. */
const fmtLeft = (secs: number) => (secs >= 3600 ? fmtHMS(secs).replace(/^0/, "") : fmtHMS(secs).slice(3));

export function showDungeonWindow(s: State): void {
  const d = s.dungeon;
  if (!d) return;
  const link = s.today?.goals.find((g) => g.id === d.linkGoalId)?.label;
  routeEffects([{ kind: "popup", spec: windows.dungeonEntered(d, link) }]);
}

export function DungeonHud({ state }: { state: State }) {
  const now = useNow(1000);
  const d = state.dungeon;
  if (!d) return null;
  const left = selectors.dungeonSecondsLeft(state, now.toISOString());
  const up = left <= 0;
  return (
    <button className={`pill dungeon-hud flex-none ${up ? "ok" : ""}`} onClick={() => showDungeonWindow(state)} data-testid="dungeon-hud"
      title={`${d.rank}-rank Instant Dungeon: ${d.bossName}. Click for details or to abandon.`}
      aria-label={`${d.rank}-rank dungeon, ${up ? "time is up" : `${fmtLeft(left)} left`}, boss ${d.bossName}. Open the dungeon window`}
      style={{ borderColor: "var(--sl-purple)", color: up ? "var(--sl-gold)" : "var(--sl-purple)" }}>
      <span className="flex flex-none items-center gap-1.5 whitespace-nowrap">
        <span className="mono">&#9876; {d.rank}-RANK &middot; {up ? "BOSS DOWN?" : fmtLeft(left)}</span>
        <span className="hidden max-w-[140px] truncate 2xl:inline-block">&middot; {d.bossName}</span>
      </span>
    </button>
  );
}
