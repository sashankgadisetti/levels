import { useState } from "react";
import type { RewardDef, StatId } from "../../engine";
import { goldPriceOf, statShort } from "../../lib/derive";
import { uid, usd } from "../../lib/format";
import { openLink } from "../../lib/open";
import { dispatch, useGameState } from "../../store/game";
import { useUi } from "../../store/ui";
import { Btn, Chip, Empty, Panel, SBar } from "../ui/kit";
import { playSound } from "../system/sound";

const SYSTEM_ITEMS = [
  { name: "Potion of Recovery", effect: "Restores 50 HP.", price: 100 },
  { name: "XP Boost", effect: "+25% XP for 24 hours.", price: 150 },
  { name: "Holy Water of Life", effect: "Restores HP to full and clears Fatigue.", price: 300 },
  { name: "Rest Day Token", effect: "Convert one missed day into a rest day.", price: 250 },
  { name: "Random Box", effect: "Contains one random item.", price: 120 },
];

export function Shop() {
  const [tab, setTab] = useState<"system" | "real">("real");
  const s = useGameState();
  return (
    <div className="mx-auto max-w-[980px]">
      <div className="mb-3 flex items-end justify-between">
        <div className="tabs !mb-0 flex-1" role="tablist">
          <button role="tab" aria-selected={tab === "system"} className={`tab ${tab === "system" ? "on" : ""}`} onClick={() => setTab("system")}>SYSTEM</button>
          <button role="tab" aria-selected={tab === "real"} className={`tab ${tab === "real" ? "on" : ""}`} onClick={() => setTab("real")}>REAL-WORLD</button>
        </div>
        <div className="mono tone-gold glow-gold text-[20px] pl-4">{s.gold} G</div>
      </div>
      {s.penalty && !s.penalty.cleared && s.config.penalty.lockShop && (
        <div className="sys-card mb-3 text-center tone-red" style={{ borderColor: "var(--sl-red)" }}>The shop is locked while a penalty is active.</div>
      )}
      {tab === "system" ? <SystemTab /> : <RealTab />}
    </div>
  );
}

function SystemTab() {
  const s = useGameState();
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
      {SYSTEM_ITEMS.map((it) => (
        <div key={it.name} className="sys-card flex flex-col items-center gap-2 text-center">
          <div className="grid h-11 w-11 place-items-center border border-[var(--sl-cyan)] font-[family-name:var(--font-head)]">&#9670;</div>
          <div className="grid min-h-10 place-items-center text-[17px] leading-tight">{it.name}</div>
          <div className="copy dim !text-[15px]">{it.effect}</div>
          <div className="mono tone-gold">{it.price} G</div>
          <Btn sm disabled title="System items arrive in a later update">{s.gold >= it.price ? "[COMING SOON]" : "[INSUFFICIENT]"}</Btn>
        </div>
      ))}
    </div>
  );
}

function RealTab() {
  const s = useGameState();
  const cfg = s.config;
  const open = s.rewards.filter((r) => !r.purchasedAt).sort((a, b) => a.usd - b.usd);
  const bought = s.rewards.filter((r) => r.purchasedAt).slice().reverse();
  const budget = cfg.economy.monthlyBudgetUsd;
  const locked = !!s.penalty && !s.penalty.cleared && cfg.penalty.lockShop;
  const toast = useUi((u) => u.showToast);

  const buy = (r: RewardDef) => {
    dispatch({ type: "REWARD_PURCHASED", rewardId: r.id });
    playSound("ding");
    toast(`Purchased: ${r.name}`);
    if (r.url) void openLink(r.url);
  };

  return (
    <div className="grid items-start gap-5" style={{ gridTemplateColumns: "minmax(0,1fr) 300px" }}>
      <div className="grid gap-4">
        <Panel title="Reward Shelf" right={<span className="sub">{open.length} LISTED</span>}>
          {open.length === 0 ? <Empty>Add something you&apos;d actually buy to get better &mdash; gear, a book, a course. Earn the gold, then buy it.</Empty> : (
            <div className="grid gap-3">
              {open.map((r) => {
                const price = goldPriceOf(r, cfg);
                const afford = s.gold >= price;
                const over = s.spentThisMonthUsd + r.usd > budget;
                return (
                  <div key={r.id} className={`sys-card ${afford ? "" : "dis"}`} data-testid={`reward-${r.id}`} style={afford ? undefined : { color: "var(--sl-text)", borderColor: "rgba(63,216,255,.2)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[20px]">{r.name}</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {r.stat && <Chip>{statShort(cfg, r.stat)}</Chip>}
                          <Chip>{usd(r.usd)}</Chip>
                          {over && <Chip tone="red">Over budget</Chip>}
                          {r.url && <Chip>LINK</Chip>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="mono tone-gold glow-gold text-[22px]">{price} G</div>
                        <div className="mt-2 flex justify-end gap-2">
                          <Btn sm tone="red" aria-label={`Remove ${r.name}`} onClick={() => dispatch({ type: "REWARD_REMOVED", rewardId: r.id })}>&times;</Btn>
                          <Btn sm primary disabled={!afford || locked} onClick={() => buy(r)}>[BUY]</Btn>
                        </div>
                      </div>
                    </div>
                    {!afford && <div className="mt-2"><SBar value={s.gold} max={price} tone="gold" thin label="" /></div>}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
        <AddReward />
        {bought.length > 0 && (
          <Panel title="Purchase Log">
            <table className="w-full text-[16px]"><tbody>
              {bought.map((r) => (
                <tr key={r.id} className="border-t border-[rgba(63,216,255,.15)]">
                  <td className="py-1">{r.name}</td><td className="mono text-right">{usd(r.usd)}</td><td className="mono tone-gold text-right">{r.goldPaid ?? "—"} G</td>
                  <td className="sub text-right">{r.purchasedAt?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody></table>
          </Panel>
        )}
      </div>
      <Panel title="Treasury" accent="gold">
        <div className="grid gap-3 text-[17px]">
          <SBar value={s.spentThisMonthUsd} max={budget} tone={s.spentThisMonthUsd > budget ? "red" : "gold"} numbers={false} />
          <div className="grid gap-1" style={{ gridTemplateColumns: "1fr auto" }}>
            <span className="tone-dim">Budget</span><b className="mono font-normal text-right">{usd(budget)}</b>
            <span className="tone-dim">Spent</span><b className="mono font-normal text-right">{usd(s.spentThisMonthUsd)}</b>
            <span className="tone-dim">Remaining</span><b className="mono tone-gold font-normal text-right" data-testid="remaining">{usd(Math.max(0, budget - s.spentThisMonthUsd))}</b>
            <span className="tone-dim">Rate</span><b className="mono font-normal text-right">{cfg.economy.usdToGold} G / $</b>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function AddReward() {
  const s = useGameState();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [stat, setStat] = useState<StatId | "">("");
  const valid = name.trim() && Number(price) > 0;
  const submit = () => {
    if (!valid) return;
    dispatch({ type: "REWARD_ADDED", reward: { id: uid(), name: name.trim(), usd: Number(price), url: url.trim() || undefined, stat: stat || undefined } });
    setName(""); setPrice(""); setUrl(""); setStat("");
  };
  return (
    <Panel title="Add Reward">
      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 110px" }}>
          <input className="sys-input" placeholder="Name" aria-label="Reward name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="sys-input" placeholder="$ USD" aria-label="Reward price in USD" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 170px" }}>
          <input className="sys-input" placeholder="Link (optional)" aria-label="Reward link" value={url} onChange={(e) => setUrl(e.target.value)} />
          <select className="sys-input" aria-label="Stat" value={stat} onChange={(e) => setStat(e.target.value as StatId | "")}>
            <option value="">NO STAT</option>
            {s.config.stats.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <span className="copy dim !text-[15px]">{Number(price) > 0 ? `= ${goldPriceOf({ usd: Number(price) }, s.config)} gold` : ""}</span>
          <Btn primary type="submit" disabled={!valid}>[+ ADD REWARD]</Btn>
        </div>
      </form>
    </Panel>
  );
}
