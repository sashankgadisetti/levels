import { useEffect, useState } from "react";
import { GRADE_COLOR, RANK_COLOR, gradeOf, vitalMax } from "../../lib/derive";
import { dispatch, useGameState } from "../../store/game";
import { playSound } from "../system/sound";
import { Btn, Panel, Rank, SBar } from "../ui/kit";

export function Status() {
  const s = useGameState();
  const max = vitalMax(s);
  const equipped = s.titles.find((t) => t.id === s.player.equippedTitleId);
  const pts = s.player.abilityPoints;
  const [pulse, setPulse] = useState<string>();
  useEffect(() => { if (pulse) { const t = setTimeout(() => setPulse(undefined), 400); return () => clearTimeout(t); } }, [pulse]);

  /** Spread every point evenly over the unlocked stats (remainder goes to the weakest first). */
  const autoAllocate = () => {
    const open = s.config.stats.filter((d) => !d.locked).sort((a, b) => s.stats[a.id].value - s.stats[b.id].value);
    if (!open.length || pts <= 0) return;
    const base = Math.floor(pts / open.length);
    let extra = pts % open.length;
    for (const d of open) {
      const n = base + (extra-- > 0 ? 1 : 0);
      if (n > 0) dispatch({ type: "POINTS_ALLOCATED", stat: d.id, points: n });
    }
    playSound("ding");
  };

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <Panel className="mx-auto w-full max-w-[760px]">
        <div className="absolute right-6 top-6"><Rank rank={s.player.rank} /></div>
        <h2 className="bracket-h" style={{ fontSize: 19 }}>[STATUS WINDOW]</h2>
        <div className="mt-4 grid gap-x-10 gap-y-1 text-[20px]" style={{ gridTemplateColumns: "1fr 1fr", paddingRight: 70 }}>
          <div><span className="tone-dim">Name: </span><span className="mono">{s.player.name || "—"}</span></div>
          <div><span className="tone-dim">Level: </span><span className="mono">{s.player.level}</span></div>
          <div><span className="tone-dim">Job: </span><span className="mono">{s.player.job ?? "None"}</span></div>
          <div><span className="tone-dim">Title: </span><span className="mono">{equipped?.name ?? "None"}</span></div>
        </div>
        <div className="mt-4 grid gap-2">
          <SBar label="HP" value={s.vitals.hp} max={max.hp} tone="red" />
          <SBar label="MP" value={s.vitals.mp} max={max.mp} tone="blue" />
          <SBar label="Fatigue" value={s.vitals.fatigue} max={max.fatigue} tone="gold" numbers />
          <SBar label="XP" value={s.player.xp} max={s.player.xpToNext} tone="purple" />
        </div>
        <hr className="sys-rule" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="bracket-h !mb-0" style={{ fontSize: 13 }}>[STATS]</h3>
          <div className="flex items-center gap-3">
            <span className={pts > 0 ? "tone-gold glow-gold text-[17px]" : "tone-dim text-[16px]"} data-testid="points">
              {pts > 0 ? <>You have <span className="mono">{pts}</span> ability point{pts === 1 ? "" : "s"} to spend</> : "No ability points to spend"}
            </span>
            <Btn sm tone="gold" disabled={pts <= 0} onClick={autoAllocate} title="Spread all points evenly across unlocked stats" aria-label="Auto-allocate ability points evenly">Auto</Btn>
          </div>
        </div>
        <div className="mt-2 grid gap-1">
          {s.config.stats.map((d) => {
            const v = s.stats[d.id];
            const locked = d.locked;
            const toNext = v.xp % 100;
            const ready = !locked && pts > 0;
            return (
              <div key={d.id} className="grid items-center gap-3 py-1.5 text-[19px]" style={{ gridTemplateColumns: "150px 1fr 48px 40px", color: locked ? "var(--sl-locked-text)" : undefined }}>
                <div>{d.label}<small className="block text-[13px] leading-none" style={{ color: locked ? "var(--sl-locked-text)" : "var(--sl-muted)" }}>{locked ? "Locked" : `${toNext}/100 xp to next point`}</small></div>
                <div className="sys-bar" role="progressbar" aria-label={`${d.label} progress to next point`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={locked ? 0 : toNext}
                  style={locked ? { borderColor: "var(--sl-locked)", ["--c" as string]: "var(--sl-locked)" } : undefined}><i style={{ width: `${locked ? 0 : toNext}%`, boxShadow: locked ? "none" : undefined }} /></div>
                <div className="mono text-right text-[22px]" style={pulse === d.id ? { color: "var(--sl-gold)", textShadow: "0 0 10px var(--sl-gold)" } : undefined}>{v.value}</div>
                <button disabled={!ready} aria-label={locked ? `${d.label} is locked` : `Allocate point to ${d.label}`} title={locked ? "Locked" : pts > 0 ? "Spend 1 ability point" : "Level up to earn ability points"} className={`plus-btn ${ready ? "ready" : ""}`}
                  onClick={() => { dispatch({ type: "POINTS_ALLOCATED", stat: d.id, points: 1 }); setPulse(d.id); playSound("ding"); }}>
                  {locked ? <span aria-hidden="true" className="text-[14px]">&#128274;</span> : "+"}
                </button>
              </div>
            );
          })}
        </div>
        <hr className="sys-rule" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" aria-label="Streaks">
            {s.config.stats.filter((d) => !d.locked).map((d) => {
              const st = s.streaks[d.id];
              const cur = st?.current ?? 0;
              return (
                <span key={d.id} tabIndex={0} className={`chip streak ${cur >= 7 ? "gold" : ""}`} title={`${d.label} streak: ${cur} day${cur === 1 ? "" : "s"}. Best: ${st?.best ?? 0}`}>
                  <Flame hot={cur >= 3} />{d.short} <b className="mono font-normal">{cur}</b>
                  <span className="best">best {st?.best ?? 0}</span>
                </span>
              );
            })}
          </div>
          <div className="mono tone-gold">{s.gold} G</div>
        </div>
        {s.history.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="sub mr-2">Last 14 days</span>
            {s.history.slice(-14).map((q) => { const g = gradeOf(q); return <span key={q.date} className="grade" title={`${q.date}: ${q.result ?? g}`} style={{ color: GRADE_COLOR[g], width: 20, height: 20, fontSize: 9 }}>{g}</span>; })}
          </div>
        )}
        <p className="sub mt-3 text-center" style={{ color: RANK_COLOR[s.player.rank] }}>Hunter rank {s.player.rank}</p>
      </Panel>
    </div>
  );
}

function Flame({ hot }: { hot: boolean }) {
  return hot ? (
    <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 0c.5 3 3.5 4.300 3.500 8A3.500 3.500 0 0 1 6 12 3.500 3.500 0 0 1 2.500 8c0-1.500.700-2.500 1.500-3.300C4 6 4.700 6.500 5.200 6.500 5.800 4.500 5.500 2 6 0z" fill="currentColor" /></svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0l5 5-5 5-5-5z" fill="none" stroke="currentColor" strokeWidth="1.200" /></svg>
  );
}
