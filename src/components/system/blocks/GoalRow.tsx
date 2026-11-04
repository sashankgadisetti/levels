import { useEffect, useRef, useState } from "react";
import { fmtNum, pct } from "../../../lib/format";
import type { BlockProps } from "./types";

/** Quick-log step for the "+N" button. */
const stepFor = (unit: string, target: number) => (/^min/i.test(unit) ? 15 : target >= 8 ? 5 : 0);

export function GoalRow({ block, onAction }: BlockProps<"goalRow">) {
  const [cur, setCur] = useState(block.current);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [bump, setBump] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setCur(block.current), [block.current]);
  useEffect(() => { if (typing) inputRef.current?.select(); }, [typing]);

  const done = cur >= block.target || (block.done === true && cur === block.current);
  const step = stepFor(block.unit, block.target);

  const log = (delta: number) => {
    if (delta === 0) return;
    setCur((c) => Math.max(0, c + delta));
    setBump((b) => b + 1);
    onAction?.({ label: `+${delta}`, kind: "progress:goal", arg: `${block.goalId}:${delta}` });
  };
  const complete = () => {
    setCur(block.target);
    setBump((b) => b + 1);
    onAction?.({ label: "Done", kind: "complete:goal", arg: block.goalId });
  };
  const commit = () => {
    setTyping(false);
    const v = Number(draft);
    if (!draft.trim() || !Number.isFinite(v) || v < 0) return;
    if (v >= block.target && cur < block.target) {
      setCur(v);
      onAction?.({ label: "Done", kind: "complete:goal", arg: block.goalId });
    } else log(v - cur);
  };

  return (
    <div className={`sys-goal ${done ? "done" : ""} ${bump ? "bump" : ""}`} data-testid={`goal-${block.goalId}`}>
      <div className="n">
        {block.label}
        <small>
          {block.stat ? `(${block.stat}) ` : ""}
          {fmtNum(block.target)} {block.unit}
        </small>
      </div>
      {typing ? (
        <input
          ref={inputRef}
          className="sys-input num"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setTyping(false);
          }}
          aria-label={`Set ${block.label}`}
        />
      ) : (
        <button key={bump} className="c" title="Click to type a value" onClick={() => { setDraft(String(cur)); setTyping(true); }}>
          [{fmtNum(cur)}/{fmtNum(block.target)}]
        </button>
      )}
      <div className="bar-wrap">
        <div className="sys-bar thin"><i style={{ width: `${pct(cur, block.target)}%` }} /></div>
      </div>
      {onAction && !done && (
        <div className="quick">
          <button className="sys-btn sm" onClick={() => log(1)}>+1</button>
          {step > 1 && <button className="sys-btn sm" onClick={() => log(step)}>+{step}</button>}
          <button className="sys-btn sm gold" onClick={complete} title="Mark complete">&#10003;</button>
        </div>
      )}
    </div>
  );
}
