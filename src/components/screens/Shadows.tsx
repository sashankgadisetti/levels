import { statLabel } from "../../lib/derive";
import { useGameState } from "../../store/game";
import { ShadowFigure } from "../system/blocks/Shadow";
import { Chip, Empty, Panel } from "../ui/kit";

export function Shadows() {
  const s = useGameState();
  return (
    <div className="mx-auto max-w-[980px]">
      <Panel title="Shadow Army" accent="purple" right={<span className="sub">{s.shadows.length} IN THE ARMY</span>}>
        {s.shadows.length === 0 ? <Empty>No shadows yet. Keep a streak going for 7 days to be offered an extraction.</Empty> : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
            {s.shadows.map((sh) => (
              <div key={sh.id} className="sys-card flex flex-col items-center text-center" style={{ borderColor: "rgba(155,92,255,.5)", background: "radial-gradient(ellipse at 50% 100%, rgba(155,92,255,.3), rgba(155,92,255,.05) 70%)" }}>
                <ShadowFigure size={110} />
                <div className="mt-2 font-[family-name:var(--font-head)] text-[18px] tracking-[0.18em]" style={{ color: "var(--sl-purple)", textShadow: "0 0 12px var(--sl-purple)" }}>{sh.name}</div>
                <div className="mt-1 flex flex-wrap justify-center gap-2"><Chip tone="purple">{sh.rank}</Chip><Chip>{statLabel(s.config, sh.stat)}</Chip></div>
                {sh.epithet && <p className="mb-0 mt-2 text-[14px] normal-case tone-dim">{sh.epithet}</p>}
                <div className="sub mt-2">STREAK AT EXTRACTION: {sh.streakAtExtraction}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
