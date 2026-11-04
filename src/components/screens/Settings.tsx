import { useEffect, useRef, useState } from "react";
import type { Config, HabitDef, Weekday } from "../../engine";
import { dispatch, gameStore, useGameState } from "../../store/game";
import { getAutostart, getOracleApiKey, setAutostart, setOracleApiKey, useSettings } from "../../store/settings";
import { useUi } from "../../store/ui";
import { Btn, Field, Panel, Toggle } from "../ui/kit";

const DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function Settings() {
  const s = useGameState();
  const cfg = s.config;
  const toast = useUi((u) => u.showToast);
  const { muted, volume, set } = useSettings();
  const [name, setName] = useState(cfg.player.name);
  const [dayEnds, setDayEnds] = useState(cfg.player.dayEndsAt);
  const [habits, setHabits] = useState<HabitDef[]>(cfg.habits);
  const [qh, setQh] = useState(cfg.popups.quietHours ?? { from: "", to: "" });
  const [oracle, setOracle] = useState(cfg.oracle);
  const [apiKey, setApiKey] = useState("");
  const [auto, setAuto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void getOracleApiKey().then((k) => setApiKey(k ?? "")); void getAutostart().then(setAuto); }, []);

  const patch = (p: Partial<Config>) => { dispatch({ type: "CONFIG_CHANGED", patch: p }); toast("[SETTINGS SAVED]"); };

  const save = () => {
    const quiet = qh.from && qh.to ? { from: qh.from, to: qh.to } : undefined;
    patch({ player: { ...cfg.player, name: name.trim() || cfg.player.name, dayEndsAt: dayEnds }, habits, popups: { ...cfg.popups, quietHours: quiet }, oracle });
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
    try { toast(`[IMPORTED ${await gameStore.getState().importEvents(await f.text())} EVENTS]`); } catch (e) { toast(`[IMPORT FAILED] ${(e as Error).message}`); }
  };
  const doReset = async () => {
    if (!confirm("Reset ALL data? This cannot be undone.")) return;
    await gameStore.getState().reset();
    toast("[DATA RESET]");
  };

  const setHabit = (i: number, p: Partial<HabitDef>) => setHabits(habits.map((h, j) => (j === i ? { ...h, ...p } : h)));

  return (
    <div className="mx-auto grid max-w-[820px] gap-5">
      <Panel title="General">
        <Field label="Player name"><input className="sys-input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Day ends at" hint="Day boundary"><input className="sys-input num !w-28" type="time" value={dayEnds} onChange={(e) => setDayEnds(e.target.value)} /></Field>
        <Field label="Quiet hours" hint="No pop-ups between"><div className="flex items-center gap-2">
          <input className="sys-input num !w-28" type="time" aria-label="Quiet from" value={qh.from} onChange={(e) => setQh({ ...qh, from: e.target.value })} />
          <span className="sub">TO</span>
          <input className="sys-input num !w-28" type="time" aria-label="Quiet to" value={qh.to} onChange={(e) => setQh({ ...qh, to: e.target.value })} />
        </div></Field>
        <Field label="Mute sounds"><Toggle on={muted} onChange={(v) => set({ muted: v })} label="Mute" /></Field>
        <Field label="Volume"><input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => set({ volume: Number(e.target.value) })} className="w-48 accent-[var(--sl-cyan)]" /></Field>
        <Field label="Launch at login"><Toggle on={auto} onChange={(v) => { setAuto(v); void setAutostart(v).catch(() => setAuto(!v)); }} label="Autostart" /></Field>
      </Panel>

      <Panel title="Goals">
        <div className="grid gap-3">
          {habits.map((h, i) => (
            <div key={h.id} className="sys-card">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[19px]">{h.label} <span className="sub">({h.stat})</span></div>
                <div className="flex items-center gap-2">
                  <input className="sys-input num" type="number" min={0} step={h.kind === "count" ? 1 : 0.5} aria-label={`${h.label} target`} value={h.target} onChange={(e) => setHabit(i, { target: Math.max(0, Number(e.target.value)) })} />
                  <span className="sub w-14">{h.unit}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="sub mr-2">REST DAYS</span>
                {DAYS.map((d) => {
                  const on = h.restDays?.includes(d);
                  return <button key={d} type="button" className="chip" aria-pressed={!!on} style={on ? { borderColor: "var(--sl-gold)", color: "var(--sl-gold)", background: "rgba(255,204,77,.1)" } : { opacity: 0.6 }}
                    onClick={() => setHabit(i, { restDays: on ? (h.restDays ?? []).filter((x) => x !== d) : [...(h.restDays ?? []), d] })}>{d}</button>;
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Oracle">
        <Field label="Enabled"><Toggle on={oracle.enabled} onChange={(v) => setOracle({ ...oracle, enabled: v })} label="Oracle enabled" /></Field>
        <Field label="Model"><input className="sys-input" value={oracle.model} onChange={(e) => setOracle({ ...oracle, model: e.target.value })} /></Field>
        <Field label="API key" hint="Stored on this device"><input className="sys-input" type="password" autoComplete="off" placeholder="sk-ant-…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} onBlur={() => void setOracleApiKey(apiKey)} /></Field>
        {!apiKey && <p className="sub m-0">[THE ORACLE IS SILENT. ADD AN API KEY TO ENABLE GENERATION.]</p>}
      </Panel>

      <div className="flex justify-end"><Btn primary onClick={() => { void setOracleApiKey(apiKey); save(); }}>[SAVE SETTINGS]</Btn></div>

      <Panel title="Data" accent="red">
        <div className="flex flex-wrap gap-3">
          <Btn onClick={() => void doExport()}>[EXPORT JSON]</Btn>
          <Btn onClick={() => fileRef.current?.click()}>[IMPORT JSON]</Btn>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ""; }} />
          <Btn tone="red" onClick={() => void doReset()}>[RESET ALL DATA]</Btn>
        </div>
      </Panel>
    </div>
  );
}
