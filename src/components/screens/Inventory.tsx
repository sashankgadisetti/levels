import { useState } from "react";
import type { Item } from "../../engine";
import { dispatch, useGameState } from "../../store/game";
import { playSound } from "../system/sound";
import { Btn, Empty, Panel } from "../ui/kit";

const RARITY: Record<string, string> = { common: "var(--sl-muted)", rare: "var(--sl-cyan)", epic: "var(--sl-purple)", legendary: "var(--sl-gold)" };

export function Inventory() {
  const s = useGameState();
  const [sel, setSel] = useState<string>();
  const item: Item | undefined = s.inventory.find((i) => i.id === sel);
  const open = () => { playSound("ding"); dispatch({ type: "BOX_OPENED", seed: Math.floor(Math.random() * 2 ** 31) }); };
  return (
    <div className="mx-auto grid max-w-[980px] gap-5">
      <Panel title="Random Boxes" accent="gold">
        <div className="flex items-center justify-between">
          <div className="text-[20px]">UNOPENED <span className="mono tone-gold glow-gold ml-2 text-[26px]" data-testid="boxes">x{s.boxes}</span></div>
          <Btn primary tone="gold" disabled={s.boxes <= 0} onClick={open}>[OPEN BOX]</Btn>
        </div>
      </Panel>
      <div className="grid items-start gap-5" style={{ gridTemplateColumns: "minmax(0,1fr) 300px" }}>
        <Panel title="Items" right={<span className="sub">{s.inventory.length} HELD</span>}>
          {s.inventory.length === 0 ? <Empty>Nothing here yet. Clear a full Daily Quest to earn a random box.</Empty> : (
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))" }}>
              {s.inventory.map((i) => {
                const c = RARITY[i.rarity];
                return (
                  <button key={i.id} onClick={() => setSel(i.id)} className="flex aspect-square flex-col items-center justify-center gap-2 p-2 text-center"
                    style={{ border: `1px solid ${c}`, background: `color-mix(in srgb, ${c} ${sel === i.id ? 20 : 7}%, transparent)`, boxShadow: sel === i.id ? `0 0 14px ${c}` : "none" }}>
                    <span className="text-[26px]" style={{ color: c, textShadow: `0 0 8px ${c}` }}>&#9670;</span>
                    <span className="text-[14px] leading-tight">{i.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
        <Panel title="Detail">
          {!item ? <p className="sub text-center">SELECT AN ITEM</p> : (
            <div className="grid gap-2">
              <div className="text-[20px]" style={{ color: RARITY[item.rarity] }}>{item.name}</div>
              <div className="sub" style={{ color: RARITY[item.rarity] }}>{item.rarity}</div>
              <p className="m-0 text-[15px] normal-case tone-dim">{item.description}</p>
              <Btn primary disabled={!item.consumable} onClick={() => { dispatch({ type: "ITEM_USED", itemId: item.id }); setSel(undefined); }}>[USE]</Btn>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
