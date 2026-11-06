import { useEffect, useRef, useState } from "react";
import { fmtNum, pct } from "../../../lib/format";
import type { BlockProps } from "./types";

export type GoalKind = "minutes" | "hours" | "count";
/** Habit kind from its unit: min -> minutes, h -> hours, anything else is a counter. */
export const kindOfUnit = (unit: string): GoalKind => (/^min/i.test(unit) ? "minutes" : /^h(ours?|rs?)?$/i.test(unit) ? "hours" : "count");
const MINUTE_CHIPS = [15, 30, 60];
const HOUR_CHIPS = [6, 7, 8, 9];

interface Props extends BlockProps<"goalRow"> {
  /** Sleep habits are logged in the morning for the night before. Falls back to a "sleep" label heuristic. */
  prevNight?: boolean;
  /** Daily Quest screen only: show a Rest day button that calls this. `restTitle` explains what it uses up. */
  onRest?: () => void;
  restTitle?: string;
}

export function GoalRow({ block, onAction, prevNight, onRest, restTitle }: Props) {
  const [cur, setCur] = useState(block.current);
  const [draft, setDraft] = useState("");
  const [bump, setBump] = useState(0);
  const [logged, setLogged] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setCur(block.current), [block.current]);
  useEffect(() => { if (!logged) return; const t = setTimeout(() => setLogged(undefined), 1600); return () => clearTimeout(t); }, [logged, bump]);

  const kind = kindOfUnit(block.unit);
  const done = cur >= block.target || (block.done === true && cur === block.current);
  const night = prevNight ?? (kind === "hours" && /sleep/i.test(block.label));
  const label = night && !/last night/i.test(block.label) ? `${block.label} (last night)` : block.label;

  const flash = (msg: string) => { setBump((b) => b + 1); setLogged(msg); };
  const add = (delta: number) => {
    if (delta === 0) return;
    setCur((c) => Math.min(block.target, Math.max(0, c + delta)));
    flash(`logged +${fmtNum(delta)} ✓`);
    onAction?.({ label: `+${delta}`, kind: "progress:goal", arg: `${block.goalId}:${delta}` });
  };
  const setTo = (v: number) => {
    if (!Number.isFinite(v) || v < 0) return;
    const delta = v - cur;
    if (delta === 0) return;
    setCur(Math.min(v, block.target));
    flash(`logged ${fmtNum(Math.min(v, block.target))} ${block.unit} ✓`);
    onAction?.({ label: String(delta), kind: "progress:goal", arg: `${block.goalId}:${delta}` });
  };
  const complete = (shown = block.target) => {
    setCur(shown);
    flash("logged ✓");
    onAction?.({ label: "Done", kind: "complete:goal", arg: block.goalId });
  };
  const commit = () => {
    const v = Number(draft);
    setDraft("");
    if (!draft.trim()) return;
    setTo(v);
  };

  return (
    <div
      className={`sys-goal ${onAction && !done ? "logrow" : ""} ${done ? "done" : ""} ${bump ? "bump" : ""}`}
      data-testid={`goal-${block.goalId}`}
      onClick={(e) => { if (!done && !(e.target as HTMLElement).closest("button,input")) inputRef.current?.focus(); }}
    >
      <div className="n">
        {label}
        <small>
          {block.stat ? `${block.stat} · ` : ""}
          goal {fmtNum(block.target)} {block.unit}
        </small>
      </div>
      <div className="c" aria-label={`${fmtNum(cur)} of ${fmtNum(block.target)} ${block.unit}`}>{fmtNum(cur)}/{fmtNum(block.target)}</div>
      <div className="bar-wrap">
        <div className="sys-bar thin"><i style={{ width: `${pct(cur, block.target)}%` }} /></div>
      </div>
      {onAction && !done && block.mode === "yesno" && (
        <div className="quick" key="quick">
          <button className="qbtn done-btn" onClick={() => add(1)} title="Mark complete" aria-label={`Yes, log one for ${label}`}>Yes, I did</button>
          <span className="grow" />
          {logged && <span className="logged" role="status">{logged}</span>}
        </div>
      )}
      {onAction && !done && block.mode !== "yesno" && (
        <div className="quick" key="quick">
          {kind === "minutes" && MINUTE_CHIPS.map((m) => <button key={m} className="qbtn" onClick={() => add(m)} aria-label={`Add ${m} minutes to ${label}`}>+{m}</button>)}
          {kind === "hours" && HOUR_CHIPS.map((h) => <button key={h} className="qbtn" onClick={() => setTo(h)} aria-label={`Log ${h} hours for ${label}`}>{h}h</button>)}
          {kind === "count" && <button className="qbtn" onClick={() => add(1)} aria-label={`Add one to ${label}`}>+1</button>}
          <button className="qbtn done-btn" onClick={() => complete()} title="Mark complete" aria-label={`Mark ${label} complete`}>Done</button>
          {onRest && <button className="qbtn rest-btn" onClick={onRest} title={restTitle} aria-label={`Take a rest day for ${label}`}>Rest day</button>}
          <span className="grow" />
          {logged && <span className="logged" role="status">{logged}</span>}
          <input
            ref={inputRef}
            data-quicklog
            className="sys-input num qinput"
            inputMode="decimal"
            placeholder="other"
            value={draft}
            aria-label={`Type a value for ${label}`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setDraft(""); inputRef.current?.blur(); }
            }}
            onBlur={() => { if (draft.trim()) commit(); }}
          />
        </div>
      )}
      {done && logged && <div className="logged" style={{ gridColumn: "1 / -1" }} role="status">{logged}</div>}
    </div>
  );
}
