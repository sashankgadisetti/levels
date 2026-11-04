import { type BlockProps } from "./types";

const RARITY: Record<string, string> = {
  common: "var(--sl-muted)", rare: "var(--sl-cyan)", epic: "var(--sl-purple)", legendary: "var(--sl-gold)",
};

export function ItemCard({ block }: BlockProps<"itemCard">) {
  const c = RARITY[block.rarity];
  const unaffordable = block.affordable === false;
  return (
    <div className="flex items-center gap-4 p-3" style={{ border: `1px solid ${c}`, background: `color-mix(in srgb, ${c} 8%, transparent)`, boxShadow: `0 0 14px color-mix(in srgb, ${c} 30%, transparent)`, opacity: unaffordable ? 0.7 : 1 }}>
      <div className="grid h-12 w-12 flex-none place-items-center font-[family-name:var(--font-head)]" style={{ border: `1px solid ${c}`, color: c, textShadow: `0 0 8px ${c}` }}>
        &#9670;
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[20px]" style={{ color: c, textShadow: `0 0 8px ${c}` }}>{block.name}</div>
        <div className="sub" style={{ color: c }}>{block.rarity}</div>
        <div className="mt-1 text-[15px] normal-case leading-snug" style={{ letterSpacing: "0.03em" }}>{block.description}</div>
      </div>
      {(block.goldPrice != null || block.usdPrice != null) && (
        <div className="mono text-right">
          {block.goldPrice != null && <div className="tone-gold text-[18px]">{block.goldPrice} G</div>}
          {block.usdPrice != null && <div className="text-[13px] opacity-80">${block.usdPrice}</div>}
          {unaffordable && <div className="tone-red text-[11px]">INSUFFICIENT</div>}
        </div>
      )}
    </div>
  );
}
