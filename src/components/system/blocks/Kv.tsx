import type { BlockProps } from "./types";

export function Kv({ block }: BlockProps<"kv">) {
  return (
    <div className="grid gap-x-8 gap-y-1 text-[19px]" style={{ gridTemplateColumns: "auto 1fr" }}>
      {block.rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <span className="tone-dim">{k}</span>
          <b className="mono font-normal text-right sm:text-left">{v}</b>
        </div>
      ))}
    </div>
  );
}
