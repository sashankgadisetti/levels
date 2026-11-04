import { pct } from "../../../lib/format";
import type { BlockProps } from "./types";

export function StatRow({ block }: BlockProps<"statRow">) {
  const locked = !!block.locked;
  const max = block.max ?? Math.max(30, Math.ceil((block.value + 5) / 10) * 10);
  return (
    <div className={`grid items-center gap-3 text-[19px] ${locked ? "tone-text" : ""}`} style={{ gridTemplateColumns: "130px 1fr 70px", color: locked ? "var(--sl-locked)" : undefined }}>
      <div>
        {block.stat}
        {locked && <span className="sub ml-2" style={{ color: "var(--sl-locked)" }}>LOCKED</span>}
      </div>
      <div className="sys-bar" style={locked ? { borderColor: "var(--sl-locked)", ["--c" as string]: "var(--sl-locked)" } : undefined}>
        <i style={{ width: `${pct(block.value, max)}%`, boxShadow: locked ? "none" : undefined }} />
      </div>
      <div className="mono text-right text-[21px]">
        {block.value}
        {block.delta ? <span className="tone-gold ml-1 text-[14px]">{block.delta > 0 ? `+${block.delta}` : block.delta}</span> : null}
      </div>
    </div>
  );
}
