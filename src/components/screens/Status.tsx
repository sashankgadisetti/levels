import { useEffect, useState } from "react";
import { GRADE_COLOR, RANK_COLOR, gradeOf, vitalMax } from "../../lib/derive";
import { dispatch, useGameState } from "../../store/game";
import { playSound } from "../system/sound";
import { Chip, Panel, Rank, SBar } from "../ui/kit";

export function Status() {
  const s = useGameState();
  const max = vitalMax(s);
  const equipped = s.titles.find((t) => t.id === s.player.equippedTitleId);
  const pts = s.player.abilityPoints;
  const statMax = Math.max(30, ...Object.values(s.stats).map((v) => v.value + 6));
  const [pulse, setPulse] = useState<string>();
  useEffect(() => { if (pulse) { const t = setTimeout(() => setPulse(undefined), 400); return () => clearTimeout(t); } }, [pulse]);

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
      <Panel className="mx-auto w-full max-w-[760px]">
        <div className="absolute right-6 top-6"><Rank rank={s.player.rank} /></div>
        <h2 className="bracket-h" style={{ fontSize: 19 }}>[STATUS WINDOW]</h2>
        <div className="mt-4 grid gap-x-10 gap-y-1 text-[20px]" style={{ gridTemplateColumns: "1fr 1fr", paddingRight: 70 }}>
          <div><span className="tone-dim">NAME: </span><span className="mono">{s.player.name || "—"}</span></div>
          <div><span className="tone-dim">LEVEL: </span><span className="mono">{s.player.level}</span></div>
          <div><span className="tone-dim">JOB: </span><span className="mono">{s.player.job ?? "NONE"}</span></div>
          <div><span className="tone-dim">TITLE: </span><span className="mono">{equipped?.name ?? "NONE"}</span></div>
        </div>
        <div className="mt-4 grid gap-2">
          <SBar label="HP" value={s.vitals.hp} max={max.hp} tone="red" />
          <SBar label="MP" value={s.vitals.mp} max={max.mp} tone="blue" />
          <SBar label="FATIGUE" value={s.vitals.fatigue} max={max.fatigue} tone="gold" numbers />
          <SBar label={`XP`} value={s.player.xp} max={s.player.xpToNext} tone="purple" />
        </div>
        <hr className="sys-rule" />
        <h3 className="bracket-h" style={{ fontSize: 13 }}>[STATS]</h3>
        <div className="grid gap-1">
          {s.config.stats.map((d) => {
            const v = s.stats[d.id];
            const locked = d.locked;
            return (
              <div key={d.id} className="grid items-center gap-3 py-1 text-[19px]" style={{ gridTemplateColumns: "150px 1fr 48px 30px", color: locked ? "var(--sl-locked)" : undefined }}>
                <div>{d.label}<small className="sub block !text-[12px] !leading-none" style={locked ? { color: "var(--sl-locked)" } : undefined}>{locked ? "LOCKED" : d.short}</small></div>
                <div className="sys-bar" style={locked ? { borderColor: "var(--sl-locked)", ["--c" as string]: "var(--sl-locked)" } : undefined}><i style={{ width: `${(v.value / statMax) * 100}%`, boxShadow: locked ? "none" : undefined }} /></div>
                <div className="mono text-right text-[22px]" style={pulse === d.id ? { color: "var(--sl-gold)", textShadow: "0 0 10px var(--sl-gold)" } : undefined}>{v.value}</div>
                <button disabled={locked || pts <= 0} aria-label={`Allocate point to ${d.label}`} className="grid h-[26px] w-[26px] place-items-center border font-[family-name:var(--font-mono)] text-[18px] leading-none enabled:hover:bg-[rgba(63,216,255,.3)] disabled:cursor-default"
                  style={{ borderColor: locked || pts <= 0 ? "var(--sl-locked)" : "var(--sl-cyan)", color: locked || pts <= 0 ? "var(--sl-locked)" : "var(--sl-cyan)" }}
                  onClick={() => { dispatch({ type: "POINTS_ALLOCATED", stat: d.id, points: 1 }); setPulse(d.id); playSound("ding"); }}>
                  {locked ? "\u{1F512}" : "+"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="glow-gold tone-gold mt-4 text-center text-[19px]">[AVAILABLE ABILITY POINTS: <span className="mono">{pts}</span>]</p>
        <hr className="sys-rule" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {s.config.stats.filter((d) => !d.locked).map((d) => (
              <Chip key={d.id} tone={s.streaks[d.id]?.current >= 7 ? "gold" : undefined}>{d.short} STREAK <b className="mono font-normal">{s.streaks[d.id]?.current ?? 0}</b></Chip>
            ))}
          </div>
          <div className="mono tone-gold">{s.gold} G</div>
        </div>
        {s.history.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="sub mr-2">LAST 14 DAYS</span>
            {s.history.slice(-14).map((q) => { const g = gradeOf(q); return <span key={q.date} className="grade" title={`${q.date}: ${q.result ?? g}`} style={{ color: GRADE_COLOR[g], width: 20, height: 20, fontSize: 9 }}>{g}</span>; })}
          </div>
        )}
        <p className="sub mt-3 text-center" style={{ color: RANK_COLOR[s.player.rank] }}>HUNTER RANK {s.player.rank}</p>
      </Panel>
    </div>
  );
}
