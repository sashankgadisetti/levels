/**
 * Gates: Project quests ("boss fights"). Open a Gate for a real goal with a deadline; the planner (Claude, or a
 * deterministic fallback) splits it into milestones and a daily strike that joins the Daily Quest.
 */
import { useState } from "react";
import { addDays, localDate, weekdayOf, type Project, type StatId, type Weekday, type YMD } from "../../engine";
import { projectProgress, strikesInRange, strikesLanded } from "../../engine/projects";
import { projectPlanned } from "../../engine/windows";
import { planProject, replanProject, DEFAULT_MINUTES, WORKDAYS, type ProjectPlan } from "../../agent/projects/plan";
import { statLabel } from "../../lib/derive";
import { dispatch, nowMs, useGameState } from "../../store/game";
import { useUi } from "../../store/ui";
import { SystemWindow } from "../system/SystemWindow";
import { Btn, Chip, Empty, Field, Panel, SBar } from "../ui/kit";

const DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Draft { title: string; deadline: YMD; stat: StatId; minutes: number; weekdays: Weekday[] }
interface Pending { kind: "new" | "replan"; project: Pick<Project, "id" | "title" | "bossName" | "deadline" | "stat">; plan: ProjectPlan; draft: Draft; n: number }

const newId = () => `gate-${nowMs().toString(36)}`;

function countdown(today: YMD, deadline: YMD): string {
  const d = Math.round((Date.parse(deadline) - Date.parse(today)) / 86_400_000);
  return d > 0 ? `D-${d}` : d === 0 ? "D-DAY" : `${-d}D OVER`;
}

export function Projects() {
  const s = useGameState();
  const toast = useUi((u) => u.showToast);
  const today = s.today?.date ?? localDate(new Date(nowMs()), s.config.player.dayEndsAt);
  const unlocked = s.config.stats.filter((x) => !x.locked);
  const [draft, setDraft] = useState<Draft>({ title: "", deadline: addDays(today, 28), stat: unlocked.some((x) => x.id === "INT") ? "INT" : unlocked[0]?.id ?? "INT", minutes: DEFAULT_MINUTES, weekdays: WORKDAYS });
  const [pending, setPending] = useState<Pending | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [showPast, setShowPast] = useState(false);

  const projects = s.projects ?? [];
  const active = projects.filter((p) => p.status === "active");
  const past = projects.filter((p) => p.status !== "active").slice().reverse();
  const deps = { oracle: s.config.oracle };

  async function openGate(d: Draft, n = 0) {
    if (!d.title.trim()) { toast("Name the Gate first."); return; }
    if (d.deadline <= today) { toast("The deadline must be after today."); return; }
    setBusy("new");
    try {
      const plan = await planProject({ title: d.title.trim(), deadline: d.deadline, stat: d.stat, context: { today, weekdays: d.weekdays, minutesPerDay: d.minutes } }, deps);
      setPending({ kind: "new", draft: d, n, plan, project: { id: newId(), title: d.title.trim(), bossName: plan.bossName, deadline: d.deadline, stat: d.stat } });
    } finally { setBusy(undefined); }
  }

  async function replan(p: Project, d?: Draft, n = 0) {
    const dd: Draft = d ?? { title: p.title, deadline: p.deadline, stat: p.stat, minutes: DEFAULT_MINUTES, weekdays: WORKDAYS };
    setBusy(p.id);
    try {
      const landed = strikesLanded(s, p.id);
      const scheduled = Object.keys(p.strikes).filter((x) => x < today).length;
      const plan = await replanProject(p, { today, weekdays: dd.weekdays, minutesPerDay: dd.minutes, strikesLanded: landed, strikesMissed: Math.max(0, scheduled - landed) }, deps);
      setPending({ kind: "replan", draft: dd, n, plan, project: p });
    } finally { setBusy(undefined); }
  }

  function accept(pd: Pending) {
    const milestones = pd.plan.milestones.map((m) => ({ id: m.id, title: m.title, ...(m.done ? { done: true } : {}) }));
    if (pd.kind === "new") dispatch({ type: "PROJECT_CREATED", project: { ...pd.project, bossName: pd.plan.bossName } });
    dispatch({ type: "PROJECT_PLANNED", projectId: pd.project.id, milestones, strikes: pd.plan.strikes });
    if (pd.kind === "new") setDraft((x) => ({ ...x, title: "" }));
    setPending(undefined);
    toast(pd.kind === "new" ? "Gate opened. The first strike appears in tomorrow's Daily Quest." : "Plan updated.");
  }

  function rerun(pd: Pending) {
    if (pd.kind === "new") void openGate(pd.draft, pd.n + 1);
    else { const p = projects.find((x) => x.id === pd.project.id); if (p) void replan(p, pd.draft, pd.n + 1); }
  }

  const pendingSpec = pending && projectPlanned(pending.project, {
    milestones: pending.plan.milestones,
    strikes: Object.entries(pending.plan.strikes).sort(([a], [b]) => a.localeCompare(b)).map(([date, strike]) => ({ date, strike })),
    verdict: pending.plan.verdict,
  });

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-5">
      {pending && pendingSpec && (
        <div className="flex flex-col items-center gap-2" data-testid="gate-plan">
          <SystemWindow key={`${pending.project.id}-${pending.n}`} spec={pendingSpec} width={560}
            onAction={(a) => { if (a.kind === "accept") accept(pending); }} onDismiss={() => setPending((x) => (x === pending ? undefined : x))} />
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Btn primary onClick={() => accept(pending)}>[ACCEPT]</Btn>
            <Btn disabled={!!busy} onClick={() => rerun(pending)}>{busy ? "[ANALYSING...]" : "[RE-PLAN]"}</Btn>
            <Btn onClick={() => setPending(undefined)}>[CANCEL]</Btn>
          </div>
          <p className="sub m-0 normal-case">{pending.plan.source === "claude" ? `Planned by the Oracle${pending.plan.costUsd ? ` ($${pending.plan.costUsd.toFixed(3)})` : ""}.` : pending.plan.note ?? "Deterministic plan."}</p>
        </div>
      )}

      <Panel title="Gates" accent="gold" right={<span className="sub">{active.length} ACTIVE &middot; {s.gatesCleared} CLEARED</span>}>
        {active.length === 0 ? <Empty>No Gate is open. Name a real goal with a deadline below; the System will assign a boss and a daily strike.</Empty> : (
          <div className="flex flex-col gap-4">
            {active.map((p) => <GateCard key={p.id} p={p} today={today} busy={busy === p.id} onReplan={() => void replan(p)} />)}
          </div>
        )}
      </Panel>

      <Panel title="Open a Gate">
        <form onSubmit={(e) => { e.preventDefault(); void openGate(draft); }}>
          <Field label="Objective" hint="A real goal, e.g. Ship my portfolio site">
            <input className="sys-input w-full" aria-label="Gate objective" maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Ship my portfolio site" />
          </Field>
          <Field label="Deadline" hint="Last day to work on it">
            <input className="sys-input !w-auto" type="date" aria-label="Deadline" min={addDays(today, 1)} value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
          </Field>
          <Field label="Stat" hint="Strikes count toward this stat">
            <select className="sys-input !w-auto" aria-label="Stat" value={draft.stat} onChange={(e) => setDraft({ ...draft, stat: e.target.value as StatId })}>
              {unlocked.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
          </Field>
          <Field label="Minutes per day" hint="15 to 120">
            <input className="sys-input num !w-24" type="number" min={15} max={120} step={5} aria-label="Minutes per day" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) || DEFAULT_MINUTES })} />
          </Field>
          <Field label="Strike days" hint="Days off get no strike">
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const on = draft.weekdays.includes(d);
                return <Btn key={d} type="button" sm primary={on} aria-pressed={on} onClick={() => setDraft({ ...draft, weekdays: on ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d] })}>{d.toUpperCase()}</Btn>;
              })}
            </div>
          </Field>
          <div className="sys-actions">
            <Btn primary type="submit" disabled={!!busy || !!pending}>{busy === "new" ? "[ANALYSING GATE...]" : "[OPEN A GATE]"}</Btn>
          </div>
          {!s.config.oracle.enabled && <p className="sub mb-0 mt-2 normal-case">The Oracle is off: plans use the deterministic template (Plan, Build, Polish, Ship).</p>}
        </form>
      </Panel>

      {past.length > 0 && (
        <Panel title="Gate Records" right={<Btn sm onClick={() => setShowPast((v) => !v)}>{showPast ? "[HIDE]" : `[SHOW ${past.length}]`}</Btn>}>
          {showPast && (
            <div className="flex flex-col gap-2">
              {past.map((p) => (
                <div key={p.id} className="sys-card flex flex-wrap items-center gap-3">
                  <Chip tone={p.status === "cleared" ? "gold" : p.status === "failed" ? "red" : undefined}>{p.status.toUpperCase()}</Chip>
                  <span className="font-[family-name:var(--font-head)] tracking-[0.12em]">{p.bossName}</span>
                  <span className="sub normal-case">{p.title} &middot; {p.deadline} &middot; {projectProgress(p).done}/{p.milestones.length} milestones</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function GateCard({ p, today, busy, onReplan }: { p: Project; today: YMD; busy: boolean; onReplan(): void }) {
  const s = useGameState();
  const prog = projectProgress(p, today);
  const week = strikesInRange(p, today, 7);
  const todayGoal = s.today?.goals.find((g) => g.projectId === p.id);
  return (
    <div className="sys-card" data-testid={`gate-${p.id}`} style={{ borderColor: "rgba(255,200,87,.45)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-[family-name:var(--font-head)] text-[19px] tracking-[0.16em] tone-gold glow-gold">{p.bossName}</div>
          <div className="mt-1 text-[15px] normal-case">{p.title}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{statLabel(s.config, p.stat)}</Chip>
          <Chip tone={prog.daysLeft <= 3 ? "red" : "gold"}>{countdown(today, p.deadline)}</Chip>
          <span className="sub">DEADLINE {p.deadline}</span>
        </div>
      </div>
      <div className="mt-3"><SBar value={prog.done} max={Math.max(1, prog.total)} tone={prog.allDone ? "gold" : "cyan"} label="BOSS HP" /></div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <div className="sub mb-1">MILESTONES</div>
          {p.milestones.length === 0 ? <p className="sub normal-case">No milestones yet. Re-plan to get some.</p> : (
            <ul className="m-0 list-none p-0">
              {p.milestones.map((m) => (
                <li key={m.id} className="py-0.5">
                  <label className="flex cursor-pointer items-center gap-2 text-[15px] normal-case">
                    <input type="checkbox" checked={m.done} onChange={(e) => dispatch({ type: "PROJECT_MILESTONE_SET", projectId: p.id, milestoneId: m.id, done: e.target.checked })} />
                    <span className={m.done ? "tone-dim line-through" : ""}>{m.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="sub mb-1">STRIKES THIS WEEK</div>
          {week.length === 0 ? <p className="sub normal-case">No strikes scheduled. Re-plan this week.</p> : (
            <ul className="m-0 list-none p-0">
              {week.map(({ date, strike }) => {
                const isToday = date === today;
                const done = isToday && todayGoal?.done;
                return (
                  <li key={date} className={`flex gap-2 py-0.5 text-[15px] normal-case ${isToday ? "tone-cyan" : ""}`}>
                    <span className="mono w-[86px] flex-none">{isToday ? "TODAY" : `${weekdayOf(date).toUpperCase()} ${date.slice(5)}`}</span>
                    <span className={done ? "line-through tone-dim" : ""}>&#9876; {strike.title}{strike.minutes ? ` (${strike.minutes} min)` : ""}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="sys-actions">
        <Btn sm disabled={busy} onClick={onReplan}>{busy ? "[ANALYSING...]" : "[RE-PLAN THIS WEEK]"}</Btn>
        {prog.allDone && <Btn sm tone="gold" onClick={() => dispatch({ type: "PROJECT_STATUS", projectId: p.id, status: "cleared" })}>[DEFEAT BOSS NOW]</Btn>}
        <Btn sm tone="red" onClick={() => { if (confirm(`Abandon "${p.title}"? The Gate closes with no reward.`)) dispatch({ type: "PROJECT_STATUS", projectId: p.id, status: "abandoned" }); }}>[ABANDON]</Btn>
      </div>
    </div>
  );
}
