import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { pct } from "../../lib/format";

type Tone = "cyan" | "red" | "gold" | "purple" | "dim" | "blue";

export function Panel({ title, accent, className = "", style, children, right }: { title?: string; accent?: "red" | "gold" | "purple"; className?: string; style?: CSSProperties; children: ReactNode; right?: ReactNode }) {
  const v = accent === "red" ? "penalty" : accent === "gold" ? "reward" : accent === "purple" ? "shadow" : undefined;
  return (
    <section className={`sys sys--static ${className}`} data-variant={v} style={style}>
      <div className="sys-scanlines" />
      <div className="scan-line" />
      {(title || right) && (
        <div className="relative mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="bracket-h !mb-0" style={{ color: "var(--accent)" }}>[{title.toUpperCase()}]</h2>}
          {right}
        </div>
      )}
      <div className="relative">{children}</div>
    </section>
  );
}

export function Btn({ tone, primary, sm, className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "red" | "gold"; primary?: boolean; sm?: boolean }) {
  return <button {...p} className={`sys-btn ${primary ? "primary" : ""} ${sm ? "sm" : ""} ${tone ?? ""} ${tone === "red" ? "danger" : ""} ${className}`} />;
}

export function SBar({ value, max, tone = "cyan", thin, label, numbers = true }: { value: number; max: number; tone?: Tone; thin?: boolean; label?: string; numbers?: boolean }) {
  return (
    <div className="grid items-center gap-3 text-[16px]" style={{ gridTemplateColumns: label ? "78px 1fr auto" : "1fr auto" }}>
      {label && <span>{label}</span>}
      <div className={`sys-bar ${thin ? "thin" : ""} bar-${tone}`}><i style={{ width: `${pct(value, max)}%` }} /></div>
      {numbers && <em className="mono min-w-[84px] text-right text-[15px] not-italic">{Math.round(value)} / {Math.round(max)}</em>}
    </div>
  );
}

/** Compact labelled meter for the header: `HP [bar] 90/100`. */
export function Meter({ label, value, max, tone = "cyan", title }: { label: string; value: number; max: number; tone?: Tone; title?: string }) {
  return (
    <div className="meter" title={title ?? `${label} ${Math.round(value)} / ${Math.round(max)}`}>
      <span className="lbl">{label}</span>
      <div className={`sys-bar thin bar-${tone}`}><i style={{ width: `${pct(value, max)}%` }} /></div>
      <b>{Math.round(value)}/{Math.round(max)}</b>
    </div>
  );
}

export function Chip({ children, tone }: { children: ReactNode; tone?: "gold" | "red" | "purple" }) {
  return <span className={`chip ${tone ?? ""}`}>{children}</span>;
}

export function Rank({ rank, size }: { rank: string; size?: "sm" | "lg" }) {
  return <div className={`rank-dia ${size ?? ""}`}><b>{rank === "NATIONAL" ? "N" : rank}</b></div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="grid items-center gap-3 py-1.5" style={{ gridTemplateColumns: "200px 1fr" }}>
      <span className="text-[16px]">{label}{hint && <small className="tone-dim block text-[13px] leading-snug">{hint}</small>}</span>
      <div>{children}</div>
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="sys-card text-center text-[16px] leading-normal" style={{ borderStyle: "dashed", padding: "20px 16px", color: "var(--sl-muted)" }}>{children}</div>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange(v: boolean): void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="relative h-5 w-11 border"
      style={{ borderColor: on ? "var(--sl-cyan)" : "var(--sl-muted)", background: on ? "rgba(63,216,255,.18)" : "transparent" }}>
      <i className="absolute top-0.5 block h-3.5 w-4 transition-all" style={{ left: on ? 24 : 2, background: on ? "var(--sl-cyan)" : "var(--sl-muted)", boxShadow: on ? "0 0 8px var(--sl-cyan)" : "none" }} />
    </button>
  );
}
