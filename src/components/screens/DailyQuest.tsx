import { fmtHMS } from "../../lib/format";
import { GRADE_COLOR, gradeOf, nextDayEnd, questProgress, statShort } from "../../lib/derive";
import { useNow } from "../../lib/hooks";
import { handleAction } from "../../store/actions";
import { useGameState } from "../../store/game";
import { GoalRow } from "../system/blocks";
import { usePopups } from "../../store/popups";
import { useUi } from "../../store/ui";
import { Empty, Panel } from "../ui/kit";
import { HowItWorksCard } from "../HowItWorks";

export function DailyQuest() {
  const s = useGameState();
  const now = useNow();
  const q = s.today;
  const left = (nextDayEnd(s.config, now).getTime() - now.getTime()) / 1000;
  const prog = questProgress(q);
  const cfg = s.config;
  const xp = prog.total * cfg.curves.xpPerGoal + cfg.curves.fullClearBonus;
  const gold = prog.total * cfg.economy.goldPerGoal + cfg.economy.goldFullClear;
  const helpSeen = useUi((u) => u.helpSeen);
  const popupsOpen = usePopups((p) => p.queue.length > 0);
  const cleared = q?.result === "clear" || (prog.total > 0 && prog.done === prog.total);

  return (
    <div className="mx-auto grid max-w-[760px] gap-5">
      {s.penalty && !s.penalty.cleared && (
        <Panel accent="red" title="Penalty Quest: Survive">
          <div className="flex items-center justify-between gap-4">
            <span className="tone-red">Clear a missed goal before the timer ends to survive.</span>
            <PenaltyTimer endsAt={s.penalty.endsAt} />
          </div>
        </Panel>
      )}
      <Panel title="Daily Quest: Preparation to Become Powerful" accent={cleared ? "gold" : undefined}>
        {!q ? (
          <Empty>No quest yet. Your next one arrives when the day turns over.</Empty>
        ) : (
          <>
            <div className="mb-3 flex items-end justify-between">
              <div className="sub">TODAY <span className="mono ml-2 tone-text">{prog.done}/{prog.total} done</span></div>
              <div className="text-right"><span className="sub mr-2">Day ends in</span><span className="mono text-[22px]" style={{ color: left < 3600 * 3 ? "var(--sl-red)" : "var(--sl-cyan)" }} data-testid="time-left">{fmtHMS(left)}</span></div>
            </div>
            <div className="grid gap-2">
              {q.goals.map((g) =>
                g.rest ? (
                  <div key={g.id} className="sys-goal rest done" data-testid={`goal-${g.id}`}>
                    <div className="n">{g.label}<small>{statShort(cfg, g.stat)} · rest day</small></div>
                    <div className="c mono tone-gold text-[16px]">&#10003; rest</div>
                  </div>
                ) : (
                  <GoalRow key={g.id} onAction={handleAction} prevNight={cfg.habits.find((h) => h.id === g.habitId)?.logPrevNight} block={{ type: "goalRow", goalId: g.id, label: g.label, current: g.current, target: g.target, unit: g.unit, stat: statShort(cfg, g.stat), done: g.done }} />
                ),
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-1 text-[18px]">
              <span className="sub">Reward for a full clear</span>
              <span className="mono tone-gold glow-gold">XP +{xp}</span>
              <span className="mono tone-gold glow-gold">GOLD +{gold}</span>
              <span className="mono tone-gold glow-gold">Random box x1</span>
            </div>
            <p className="copy dim mt-3">Clear every goal before the day ends and the rewards arrive immediately. Miss one and a penalty quest starts.</p>
          </>
        )}
      </Panel>
      {!helpSeen && !popupsOpen && <HowItWorksCard />}
      <Panel title="History">
        {s.history.length === 0 ? <Empty>No finished days yet. Each day you close shows up here as a letter grade.</Empty> : (
          <div className="flex flex-wrap gap-2">
            {s.history.slice(-14).map((d) => { const g = gradeOf(d); return (
              <div key={d.date} className="text-center" title={`${d.date}: ${d.result ?? ""}`}>
                <div className="grade" style={{ color: GRADE_COLOR[g] }}>{g}</div>
                <div className="sub !text-[9px] mt-1">{d.date.slice(5)}</div>
              </div>
            ); })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function PenaltyTimer({ endsAt }: { endsAt: string }) {
  const now = useNow();
  return <span className="mono tone-red text-[28px]" style={{ textShadow: "0 0 14px var(--sl-red)" }}>{fmtHMS((Date.parse(endsAt) - now.getTime()) / 1000)}</span>;
}
