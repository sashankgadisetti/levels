import { pct } from "../../../lib/format";
import { type BlockProps, barToneClass } from "./types";

export function Bar({ block }: BlockProps<"bar">) {
  return (
    <div className="grid items-center gap-3 text-[16px]" style={{ gridTemplateColumns: "84px 1fr 96px" }}>
      <span>{block.label}</span>
      <div className={`sys-bar ${barToneClass(block.tone)}`}>
        <i style={{ width: `${pct(block.value, block.max)}%` }} />
      </div>
      <em className="mono text-right text-[15px] not-italic">
        {Math.round(block.value)} / {Math.round(block.max)}
      </em>
    </div>
  );
}
