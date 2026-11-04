import { useEffect, useMemo, useRef, useState } from "react";
import type { Config, HabitDef, StatId, Weekday } from "../../engine";
import { uid } from "../../lib/format";
import { dispatch, gameStore, useGameState } from "../../store/game";
import { getAutostart, getOracleApiKey, setAutostart, setOracleApiKey, useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";
import { Btn, Field, Panel, SBar, Toggle } from "../ui/kit";
import { playSound } from "../system/sound";
import { askTheSystem, oracleSpentTodayUsd } from "../../oracle/wire";

const DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TABS = [["general", "General"], ["goals", "Goals"], ["popups", "Pop-ups"], ["oracle", "Oracle"], ["data", "Data"]] as const;
type Tab = (typeof TABS)[number][0];
const KINDS: HabitDef["kind"][] = ["count", "minutes", "hours", "check"];
const KIND_LABEL: Record<HabitDef["kind"], string> = { count: "Count (meals, sessions)", minutes: "Minutes", hours: "Hours", check: "Yes / no" };
const DEFAULT_UNIT: Record<HabitDef["kind"], string> = { count: "times", minutes: "min", hours: "h", check: "done" };
const DEFAULT_TARGET: Record<HabitDef["kind"], number> = { count: 1, minutes: 30, hours: 7, check: 1 };
const MAX_HABITS = 8;
const WARN_CHOICES = [6, 3, 2, 1];

/** Validation for the goals editor. Returns one message (or undefined) per habit, plus a list-level message. */
export function validateHabits(habits: HabitDef[]): { rows: (string | undefined)[]; list?: string } {
  const names = habits.map((h) => h.label.trim().toLowerCase());
  const rows = habits.map((h, i) => {
    if (!h.label.trim()) return "Give this goal a name.";
    if (h.label.trim().length > 48) return "Keep the name under 48 characters.";
    if (names.indexOf(h.label.trim().toLowerCase()) !== i) return "Another goal already has this name.";
    if (!Number.isFinite(h.target) || h.target <= 0) return "The target must be more than 0.";
    if (h.target > 9999) return "That target is too large.";
    if (!h.unit.trim()) return "Add a unit, like min or meals.";
    if (h.unit.trim().length > 12) return "Keep the unit under 12 characters.";
    return undefined;
  });
  const list = habits.length === 0 ? "Keep at least one goal." : habits.length > MAX_HABITS ? `At most ${MAX_HABITS} goals fit in a quest window.` : undefined;
  return { rows, list };
}

export function Settings() {
  const s = useGameState();
  const cfg = s.config;
  const toast = useUi((u) => u.showToast);
  const { muted, volume, set } = useSettings();
  const [tab, setTab] = useState<Tab>("general");
  const [name, setName] = useState(cfg.player.name);
  const [dayEnds, setDayEnds] = useState(cfg.player.dayEndsAt);
  const [habits, setHabits] = useState<HabitDef[]>(cfg.habits);
  const [qh, setQh] = useState(cfg.popups.quietHours ?? { from: "", to: "" });
  const [warn, setWarn] = useState<number[]>(cfg.popups.warnHoursBefore);
  const [oracle, setOracle] = useState(cfg.oracle);
  const [apiKey, setApiKey] = useState("");
  const [auto, setAuto] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string>();
  const [showErrors, setShowErrors] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void getOracleApiKey().then((k) => setApiKey(k ?? "")); void getAutostart().then(setAuto); }, []);

  const check = useMemo(() => validateHabits(habits), [habits]);
  const invalid = check.rows.some(Boolean) || !!check.list;
  const quiet = qh.from && qh.to ? { from: qh.from, to: qh.to } : undefined;
  const patch = useMemo<Partial<Config>>(() => ({
    player: { ...cfg.player, name: name.trim() || cfg.player.name, dayEndsAt: dayEnds },
    habits: habits.map((h) => ({ ...h, label: h.label.trim(), unit: h.unit.trim() })),
    popups: { ...cfg.popups, warnHoursBefore: [...warn].sort((a, b) => b - a), quietHours: quiet },
    oracle,
  }), [cfg, name, dayEnds, habits, warn, quiet, oracle]);
  const dirty = JSON.stringify({ p: patch.player, h: patch.habits, po: patch.popups, o: patch.oracle }) !== JSON.stringify({ p: cfg.player, h: cfg.habits, po: { ...cfg.popups, warnHoursBefore: [...cfg.popups.warnHoursBefore].sort((a, b) => b - a) }, o: cfg.oracle });

  const save = () => {
    void setOracleApiKey(apiKey);
    if (invalid) { setShowErrors(true); setTab("goals"); toast("Fix the highlighted goals first"); return; }
    dispatch({ type: "CONFIG_CHANGED", patch });
    toast("Settings saved");
  };

  /** Ask the System, capturing the Oracle's own log line so a failure can be explained in plain words. */
  const ask = async () => {
    if (!question.trim() || asking) return;
    setAsking(true); setAskError(undefined);
    const logged: string[] = [];
    const orig = console.warn;
    console.warn = (...a: unknown[]) => { if (a[0] === "[oracle]") logged.push(String(a[1] ?? "")); orig(...a); };
    try {
      const spec = await askTheSystem(question.trim());
      if (spec) toast("The System has answered");
      else setAskError(friendlyOracleError(logged[0], !!apiKey, oracle.enabled));
    } catch (e) {
      setAskError(friendlyOracleError(String((e as Error).message ?? e), !!apiKey, oracle.enabled));
    } finally { console.warn = orig; setAsking(false); }
  };

  const doExport = async () => {
    const json = await gameStore.getState().exportEvents();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = `levels-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const doImport = async (f?: File) => {
    if (!f) return;
    if (!confirm("Replace ALL current data with this file?")) return;
    try { toast(`Imported ${await gameStore.getState().importEvents(await f.text())} events`); } catch (e) { toast(`Import failed: ${(e as Error).message}`); }
  };
  const doReset = async () => {
    if (!confirm("Reset ALL data? This cannot be undone.")) return;
    await gameStore.getState().reset();
    toast("Data reset");
  };

  const setHabit = (i: number, p: Partial<HabitDef>) => setHabits(habits.map((h, j) => (j === i ? { ...h, ...p } : h)));
  const setKind = (i: number, kind: HabitDef["kind"]) => {
    const h = habits[i];
    const wasDefault = h.unit === DEFAULT_UNIT[h.kind] || !h.unit;
    setHabit(i, { kind, ...(wasDefault ? { unit: DEFAULT_UNIT[kind], target: DEFAULT_TARGET[kind] } : {}), ...(kind !== "hours" ? { logPrevNight: undefined } : {}) });
  };
  const addHabit = () => {
    if (habits.length >= MAX_HABITS) return;
    const stat = (cfg.stats.find((d) => !d.locked)?.id ?? "STR") as StatId;
    setHabits([...habits, { id: `h-${uid().slice(0, 8)}`, stat, label: "", kind: "count", target: 1, unit: "times" }]);
  };

  const spent = oracleSpentTodayUsd();

  return (
    <div className="mx-auto grid max-w-[820px] gap-4">
      <div className="tabs !mb-0" role="tablist" aria-label="Settings sections">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} className={`tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="grid gap-4">
        {tab === "general" && (
          <Panel title="General">
            <Field label="Player name"><input className="sys-input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Day ends at" hint="Your quest resets then. Anything logged before this time counts for the day."><input className="sys-input num !w-28" type="time" value={dayEnds} onChange={(e) => setDayEnds(e.target.value)} /></Field>
            <Field label="Launch at login" hint="Start Levels with your computer so reminders arrive."><Toggle on={auto} onChange={(v) => { setAuto(v); void setAutostart(v).catch(() => setAuto(!v)); }} label="Autostart" /></Field>
          </Panel>
        )}

        {tab === "goals" && (
          <Panel title="Daily goals" right={<span className="sub">{habits.length} / {MAX_HABITS}</span>}>
            <p className="copy dim mb-3">These are the goals in your Daily Quest. Changes apply from the next quest; today&apos;s stays as it is.</p>
            <div className="grid gap-3">
              {habits.map((h, i) => {
                const err = showErrors ? check.rows[i] : undefined;
                return (
                  <div key={h.id} className="sys-card" style={err ? { borderColor: "var(--sl-red)" } : undefined} data-testid={`habit-${h.id}`}>
                    <div className="grid items-center gap-2" style={{ gridTemplateColumns: "minmax(0,1fr) 190px auto" }}>
                      <input className="sys-input" placeholder="Goal name, e.g. Read" aria-label="Goal name" value={h.label} maxLength={48} onChange={(e) => setHabit(i, { label: e.target.value })} />
                      <select className="sys-input" aria-label="Stat" value={h.stat} onChange={(e) => setHabit(i, { stat: e.target.value as StatId })}>
                        {cfg.stats.filter((d) => !d.locked || d.id === h.stat).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                      </select>
                      <Btn sm tone="red" aria-label={`Remove goal ${h.label || "(unnamed)"}`} title="Remove this goal" onClick={() => setHabits(habits.filter((_, j) => j !== i))}>&times;</Btn>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select className="sys-input !w-auto" aria-label="Kind" value={h.kind} onChange={(e) => setKind(i, e.target.value as HabitDef["kind"])}>
                        {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                      <span className="sub">Target</span>
                      <input className="sys-input num" type="number" min={0} step={h.kind === "count" || h.kind === "check" ? 1 : 0.5} aria-label={`${h.label || "Goal"} target`} value={h.target} onChange={(e) => setHabit(i, { target: Number(e.target.value) })} />
                      <input className="sys-input !w-24" aria-label="Unit" placeholder="unit" maxLength={12} value={h.unit} onChange={(e) => setHabit(i, { unit: e.target.value })} />
                      {h.kind === "hours" && (
                        <label className="ml-2 flex items-center gap-2 text-[15px]"><input type="checkbox" checked={!!h.logPrevNight} onChange={(e) => setHabit(i, { logPrevNight: e.target.checked || undefined })} className="h-4 w-4 accent-[var(--sl-cyan)]" /> Log it for last night (sleep)</label>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="sub mr-2">Rest days</span>
                      {DAYS.map((d) => {
                        const on = h.restDays?.includes(d);
                        return <button key={d} type="button" className="chip !min-h-[32px]" aria-pressed={!!on} style={on ? { borderColor: "var(--sl-gold)", color: "var(--sl-gold)", background: "rgba(255,204,77,.1)" } : { opacity: 0.8 }}
                          onClick={() => setHabit(i, { restDays: on ? (h.restDays ?? []).filter((x) => x !== d) : [...(h.restDays ?? []), d] })}>{on ? "✓ " : ""}{d}</button>;
                      })}
                    </div>
                    {err && <p className="field-err mt-2 mb-0" role="alert">{err}</p>}
                  </div>
                );
              })}
            </div>
            {showErrors && check.list && <p className="field-err mt-2" role="alert">{check.list}</p>}
            <div className="mt-3"><Btn disabled={habits.length >= MAX_HABITS} onClick={addHabit}>[+ ADD GOAL]</Btn></div>
          </Panel>
        )}

        {tab === "popups" && (
          <>
            <Panel title="Pop-ups">
              <Field label="Quiet hours" hint="No pop-ups between these times; they wait until it ends.">
                <div className="flex items-center gap-2">
                  <input className="sys-input num !w-28" type="time" aria-label="Quiet from" value={qh.from} onChange={(e) => setQh({ ...qh, from: e.target.value })} />
                  <span className="sub">to</span>
                  <input className="sys-input num !w-28" type="time" aria-label="Quiet to" value={qh.to} onChange={(e) => setQh({ ...qh, to: e.target.value })} />
                  {(qh.from || qh.to) && <Btn sm onClick={() => setQh({ from: "", to: "" })}>Clear</Btn>}
                </div>
              </Field>
              <Field label="Warn me before the day ends" hint="Hours before the day closes, if goals are unfinished.">
                <div className="flex flex-wrap gap-1.5">
                  {WARN_CHOICES.map((h) => {
                    const on = warn.includes(h);
                    return <button key={h} type="button" className="chip !min-h-[34px]" aria-pressed={on} style={on ? { borderColor: "var(--sl-cyan)", color: "var(--sl-cyan)", background: "rgba(63,216,255,.16)" } : { opacity: 0.8 }}
                      onClick={() => setWarn(on ? warn.filter((x) => x !== h) : [...warn, h])}>{on ? "✓ " : ""}{h} h</button>;
                  })}
                </div>
              </Field>
            </Panel>
            <Panel title="Sound">
              <Field label="Mute sounds"><Toggle on={muted} onChange={(v) => set({ muted: v })} label="Mute" /></Field>
              <Field label="Volume"><input type="range" min={0} max={1} step={0.05} aria-label="Volume" value={volume} onChange={(e) => set({ volume: Number(e.target.value) })} className="w-48 accent-[var(--sl-cyan)]" /></Field>
              <Field label="Test sound"><Btn onClick={() => { if (muted) toast("Sounds are muted"); playSound("ding"); }}>[PLAY SOUND]</Btn></Field>
            </Panel>
          </>
        )}

        {tab === "oracle" && (
          <Panel title="Oracle">
            <p className="copy mb-1">The Oracle is optional. It asks Claude to write your daily quest and answer questions in System windows. The app works fully without it.</p>
            <p className="copy dim mb-3">Costs roughly 4&cent; per generated day. Calls stop once the daily budget is spent.</p>
            <Field label="Enabled"><Toggle on={oracle.enabled} onChange={(v) => setOracle({ ...oracle, enabled: v })} label="Oracle enabled" /></Field>
            <Field label="API key" hint="Stored on this device only."><input className="sys-input" type="password" autoComplete="off" placeholder="sk-ant-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} onBlur={() => void setOracleApiKey(apiKey)} /></Field>
            <Field label="Model"><input className="sys-input" value={oracle.model} onChange={(e) => setOracle({ ...oracle, model: e.target.value })} /></Field>
            <Field label="Daily budget" hint="In US dollars."><input className="sys-input num !w-28" type="number" min={0} step={0.05} value={oracle.dailyBudgetUsd} onChange={(e) => setOracle({ ...oracle, dailyBudgetUsd: Math.max(0, Number(e.target.value)) })} /></Field>
            <Field label="Spent today"><div className="grid w-full items-center gap-3" style={{ gridTemplateColumns: "1fr auto" }}>
              <SBar value={spent} max={Math.max(oracle.dailyBudgetUsd, 0.01)} tone={spent >= oracle.dailyBudgetUsd && oracle.dailyBudgetUsd > 0 ? "red" : "gold"} thin numbers={false} />
              <span className="mono tone-gold">${spent.toFixed(3)} / ${oracle.dailyBudgetUsd.toFixed(2)}</span>
            </div></Field>
            {!apiKey && <p className="copy dim mt-1">Add an API key above to turn generation on.</p>}
            <Field label="Ask the System" hint="Opens the answer as a System window."><div className="flex w-full gap-2">
              <input className="sys-input flex-1" placeholder="Why is my VIT lagging?" aria-label="Ask the System" value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void ask(); }} />
              <Btn primary disabled={asking || !cfg.oracle.enabled || !apiKey} onClick={() => void ask()}>{asking ? "[…]" : "[ASK]"}</Btn>
            </div></Field>
            {!cfg.oracle.enabled && <p className="copy dim">Turn the Oracle on and save to ask questions.</p>}
            {askError && <div className="error-inline mt-2" role="alert">{askError}</div>}
          </Panel>
        )}

        {tab === "data" && (
          <Panel title="Data" accent="red">
            <p className="copy dim mb-3">Everything is stored on this computer. Export a backup before importing or resetting.</p>
            <div className="flex flex-wrap gap-3">
              <Btn onClick={() => void doExport()}>[EXPORT JSON]</Btn>
              <Btn onClick={() => fileRef.current?.click()}>[IMPORT JSON]</Btn>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Import file" onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ""; }} />
              <Btn tone="red" onClick={() => void doReset()}>[RESET ALL DATA]</Btn>
            </div>
          </Panel>
        )}
      </div>

      {tab !== "data" && (
        <div className="sticky bottom-0 flex items-center justify-end gap-4 border-t border-[rgba(63,216,255,.25)] bg-[rgba(2,6,13,.85)] py-3 backdrop-blur">
          {invalid && showErrors && <span className="field-err">Some goals need fixing.</span>}
          {dirty && !invalid && <span className="copy dim !text-[15px]">You have unsaved changes.</span>}
          <Btn primary onClick={save}>[SAVE SETTINGS]</Btn>
        </div>
      )}
    </div>
  );
}

/** Turns the Oracle's terse log line into something a person can act on. */
export function friendlyOracleError(log: string | undefined, hasKey: boolean, enabled: boolean): string {
  if (!enabled) return "The Oracle is switched off. Turn it on and save, then try again.";
  if (!hasKey) return "No API key yet. Paste one above and try again.";
  const l = (log ?? "").toLowerCase();
  if (/budget/.test(l)) return "The daily budget is used up. Raise it above or try again tomorrow.";
  if (/401|403|auth|api key|invalid x-api-key/.test(l)) return "The API key was rejected. Check that it is correct and still active.";
  if (/404|model/.test(l)) return "The model name was not accepted. Check the Model field.";
  if (/429|rate|overload/.test(l)) return "The service is busy right now. Wait a minute and try again.";
  if (/network|fetch|failed to|timeout|offline/.test(l)) return "Could not reach the Oracle. Check your internet connection and try again.";
  return "The Oracle didn't answer this time. Check your key, model and budget, then try again.";
}
