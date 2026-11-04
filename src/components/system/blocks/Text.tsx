import { type BlockProps, toneClass } from "./types";

export function Text({ block }: BlockProps<"text">) {
  return (
    <p className={`sys-text ${toneClass(block.tone)}`} style={{ textAlign: block.align ?? "center" }}>
      {block.text}
    </p>
  );
}
