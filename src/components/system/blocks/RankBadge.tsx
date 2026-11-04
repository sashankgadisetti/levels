import type { BlockProps } from "./types";

export function RankBadge({ block }: BlockProps<"rankBadge">) {
  return (
    <div className="my-3 flex items-center justify-center gap-7">
      {block.previous && (
        <>
          <div className="rank-dia lg old"><b>{block.previous}</b></div>
          <div className="mono text-[30px]" style={{ color: "var(--sl-cyan)" }}>&rarr;</div>
        </>
      )}
      <div className={`rank-dia lg ${block.previous ? "new" : ""}`}><b>{block.rank}</b></div>
    </div>
  );
}
