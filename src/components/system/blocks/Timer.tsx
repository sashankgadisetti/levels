import { nowMs } from "../../../store/game";
import { useEffect, useState } from "react";
import { fmtHMS } from "../../../lib/format";
import { type BlockProps, toneClass } from "./types";

export function Timer({ block }: BlockProps<"timer">) {
  const end = Date.parse(block.endsAt);
  const left = () => (Number.isFinite(end) ? Math.max(0, Math.round((end - nowMs()) / 1000)) : 0);
  const [secs, setSecs] = useState(left);
  useEffect(() => {
    setSecs(left());
    const id = setInterval(() => setSecs(left()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.endsAt]);
  return (
    <div className="text-center">
      {block.label && <div className="sub mb-1">{block.label}</div>}
      <div
        className={`mono text-[34px] tracking-[0.1em] ${toneClass(block.tone ?? undefined) || ""}`}
        style={block.tone ? undefined : { color: "var(--accent)" }}
        data-testid="timer"
      >
        {fmtHMS(secs)}
      </div>
    </div>
  );
}
