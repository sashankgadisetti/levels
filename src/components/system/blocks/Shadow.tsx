import type { BlockProps } from "./types";

/** Hooded silhouette with glowing eyes (ported from the prototype's knight). */
export function ShadowFigure({ size = 120 }: { size?: number }) {
  return (
    <svg viewBox="0 0 110 200" width={size * 0.55} height={size} style={{ filter: "drop-shadow(0 0 14px var(--sl-purple))" }} aria-hidden>
      <path d="M55 6c-14 0-24 10-24 24 0 8 3 14 8 18-14 6-26 18-28 40l-4 62c0 6 5 10 10 10h12l4 36h44l4-36h12c5 0 10-4 10-10l-4-62c-2-22-14-34-28-40 5-4 8-10 8-18 0-14-10-24-24-24z" fill="#0a0418" stroke="var(--sl-purple)" strokeWidth="1.5" />
      <path d="M40 30c6-8 24-8 30 0" stroke="var(--sl-purple)" strokeWidth="1" fill="none" opacity=".6" />
      <ellipse className="knight-eye" cx="46" cy="32" rx="4" ry="2" fill="#d9b8ff" />
      <ellipse className="knight-eye" cx="64" cy="32" rx="4" ry="2" fill="#d9b8ff" />
    </svg>
  );
}

export function Shadow({ block }: BlockProps<"shadow">) {
  return (
    <div className="relative my-1 flex flex-col items-center overflow-hidden py-3" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(155,92,255,.35), transparent 65%)" }}>
      <ShadowFigure />
      <div className="mt-2 font-[family-name:var(--font-head)] text-[24px] tracking-[0.2em]" style={{ color: "var(--sl-purple)", textShadow: "0 0 18px var(--sl-purple)" }}>
        {block.name}
      </div>
      <div className="sub mt-1">{block.rank}</div>
      {block.epithet && <div className="mt-1 text-[15px] normal-case tone-dim" style={{ letterSpacing: "0.04em" }}>{block.epithet}</div>}
    </div>
  );
}
