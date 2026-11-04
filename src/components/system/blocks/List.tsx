import { type BlockProps, toneClass } from "./types";

export function List({ block }: BlockProps<"list">) {
  return (
    <ul className={`m-0 list-none p-0 text-[18px] leading-snug ${toneClass(block.tone)}`}>
      {block.items.map((it, i) => (
        <li key={i} className="flex gap-3 py-0.5">
          <span style={{ color: "var(--accent)" }}>&#9670;</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
