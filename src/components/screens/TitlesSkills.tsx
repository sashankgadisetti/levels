import { useState } from "react";
import { fmtHMS } from "../../lib/format";
import { useNow } from "../../lib/hooks";
import { vitalMax } from "../../lib/derive";
import { dispatch, useGameState } from "../../store/game";
import { Btn, Chip, Empty, Panel, SBar } from "../ui/kit";

export function TitlesSkills() {
  const [tab, setTab] = useState<"titles" | "skills">("titles");
  const s = useGameState();
  const now = useNow();
  const max = vitalMax(s);
  return (
    <div className="mx-auto max-w-[860px]">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "titles"} className={`tab ${tab === "titles" ? "on" : ""}`} onClick={() => setTab("titles")}>TITLES</button>
        <button role="tab" aria-selected={tab === "skills"} className={`tab ${tab === "skills" ? "on" : ""}`} onClick={() => setTab("skills")}>SKILLS</button>
      </div>
      {tab === "titles" ? (
        <Panel title="Titles" accent="gold">
          {s.titles.length === 0 ? <Empty>No titles earned.</Empty> : (
            <div className="grid gap-2">
              {s.titles.map((t) => {
                const eq = s.player.equippedTitleId === t.id;
                return (
                  <div key={t.id} className={`sys-card flex items-center justify-between gap-4 ${eq ? "gold" : ""}`}>
                    <div><div className="text-[20px]">{t.name} {eq && <Chip tone="gold">EQUIPPED</Chip>}</div><div className="text-[14px] tone-dim normal-case">{t.effect}</div></div>
                    <Btn sm primary={!eq} disabled={eq} onClick={() => dispatch({ type: "TITLE_EQUIPPED", titleId: t.id })}>[EQUIP]</Btn>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      ) : (
        <Panel title="Skills">
          <div className="mb-4"><SBar label="MP" value={s.vitals.mp} max={max.mp} tone="blue" /></div>
          {s.skills.length === 0 ? <Empty>No skills unlocked.</Empty> : (
            <div className="grid gap-2">
              {s.skills.map((k) => {
                const cdLeft = k.lastUsedAt ? (Date.parse(k.lastUsedAt) + k.cooldownHours * 3600_000 - now.getTime()) / 1000 : 0;
                const noMp = s.vitals.mp < k.mpCost;
                return (
                  <div key={k.id} className="sys-card flex items-center justify-between gap-4">
                    <div>
                      <div className="text-[20px]">{k.name} <Chip>{k.kind}</Chip></div>
                      <div className="text-[14px] tone-dim normal-case">{k.effect}</div>
                      <div className="sub mt-1">MP {k.mpCost || "--"} · COOLDOWN {k.cooldownHours}H {noMp && <span className="tone-red">· NOT ENOUGH MP</span>}</div>
                    </div>
                    {k.kind === "active" && (
                      <Btn sm primary disabled={noMp || cdLeft > 0} onClick={() => dispatch({ type: "SKILL_USED", skillId: k.id })}>{cdLeft > 0 ? fmtHMS(cdLeft) : "[USE]"}</Btn>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
