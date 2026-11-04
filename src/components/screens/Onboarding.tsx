import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { HabitDef } from "../../engine";
import { statLabel } from "../../lib/derive";
import { dispatch, useGameState } from "../../store/game";
import { playSound } from "../system/sound";
import { Btn, Panel } from "../ui/kit";

type Step = "accept" | "refused" | "name" | "habits" | "issued";

export function Onboarding() {
  const state = useGameState();
  const [step, setStep] = useState<Step>("accept");
  const [name, setName] = useState(state.config.player.name === "PLAYER" ? "" : state.config.player.name);
  const [habits, setHabits] = useState<HabitDef[]>(state.config.habits);

  const begin = () => {
    const changed = JSON.stringify(habits) !== JSON.stringify(state.config.habits);
    const player = { ...state.config.player, name: name.trim() || "PLAYER" };
    dispatch({ type: "CONFIG_CHANGED", patch: { player, ...(changed ? { habits } : {}) } });
    dispatch({ type: "PLAYER_ACCEPTED", name: player.name });
    dispatch({ type: "TICK" });
  };

  return (
    <div className="relative z-10 grid min-h-full place-items-center p-6">
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, scaleY: 0.1 }} animate={{ opacity: [0, 1, 0.4, 1, 0.7, 1], scaleY: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }} className="w-full max-w-[600px]">
          {step === "accept" && (
            <Panel accent={undefined} className="text-center">
              <div className="sys-glyph"><span>!</span></div>
              <h1 className="sys-title">[NOTIFICATION]</h1>
              <hr className="sys-rule" />
              <p className="sys-text my-4">[You have qualified to become a Player.]</p>
              <p className="sys-text mb-2">[Will you accept?]</p>
              <div className="sys-actions">
                <Btn primary onClick={() => { playSound("ding"); setStep("name"); }}>[YES]</Btn>
                <Btn onClick={() => { playSound("alarm"); setStep("refused"); }}>[NO]</Btn>
              </div>
            </Panel>
          )}
          {step === "refused" && (
            <Panel accent="red" className="text-center pulse-warn">
              <div className="sys-glyph"><span>!</span></div>
              <h1 className="sys-title">[REFUSAL]</h1>
              <hr className="sys-rule" />
              <p className="sys-text my-4 tone-red">[Refusal is not an option. Your heart will stop in 0.02 seconds.]</p>
              <div className="sys-actions"><Btn primary onClick={() => setStep("accept")}>[RECONSIDER]</Btn></div>
            </Panel>
          )}
          {step === "name" && (
            <Panel className="text-center">
              <h1 className="sys-title">[PLAYER REGISTRATION]</h1>
              <hr className="sys-rule" />
              <p className="sys-text my-4">[Enter your name, Player.]</p>
              <input autoFocus className="sys-input mx-auto max-w-[320px] text-center text-[20px]" value={name} maxLength={24} placeholder="NAME" aria-label="Player name"
                onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep("habits")} />
              <div className="sys-actions"><Btn primary disabled={!name.trim()} onClick={() => setStep("habits")}>[CONFIRM]</Btn></div>
            </Panel>
          )}
          {step === "habits" && (
            <Panel title="Daily Quest Objectives">
              <p className="sys-text mb-3 text-[16px] tone-dim">[Review your daily targets. You can change them later in Settings.]</p>
              <div className="grid gap-2">
                {habits.map((h, i) => (
                  <div key={h.id} className="sys-goal" style={{ gridTemplateColumns: "1fr auto" }}>
                    <div className="n">{h.label}<small>({statLabel(state.config, h.stat)})</small></div>
                    <div className="flex items-center gap-2">
                      <input type="number" min={h.kind === "check" ? 1 : 0.5} step={h.kind === "count" ? 1 : 0.5} className="sys-input num" value={h.target} aria-label={`${h.label} target`}
                        onChange={(e) => setHabits(habits.map((x, j) => (j === i ? { ...x, target: Math.max(0, Number(e.target.value)) } : x)))} />
                      <span className="sub w-14">{h.unit}</span>
                    </div>
                    {h.restDays?.length ? <div className="sub col-span-2">REST DAYS: {h.restDays.join(", ")}</div> : null}
                  </div>
                ))}
              </div>
              <div className="sys-actions"><Btn onClick={() => setStep("name")}>[BACK]</Btn><Btn primary onClick={() => setStep("issued")}>[CONFIRM]</Btn></div>
            </Panel>
          )}
          {step === "issued" && (
            <Panel accent="gold" className="text-center">
              <div className="sys-glyph dia"><span /></div>
              <h1 className="sys-title">[PLAYER REGISTERED]</h1>
              <hr className="sys-rule" />
              <p className="sys-text my-4">Welcome, {name.trim() || "Player"}.</p>
              <p className="sys-text mb-2 tone-gold">[The Daily Quest has been issued.]</p>
              <div className="sys-actions"><Btn primary autoFocus onClick={begin}>[BEGIN]</Btn></div>
            </Panel>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
