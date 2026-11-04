import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, SystemWindowSpec } from "../../system/spec";
import { BLOCKS } from "./blocks";
import { playSound } from "./sound";

const GLYPH: Record<string, string> = { alert: "!", diamond: "", skull: "☠", crown: "♛", box: "▣" };
const DEFAULT_GLYPH: Record<string, keyof typeof GLYPH | "none"> = {
  warning: "alert", penalty: "alert", quest: "alert", info: "alert", reward: "diamond", levelup: "diamond",
  shadow: "crown", gate: "diamond", status: "none", shop: "none",
};
/** Variants that must be answered: no close button, no Esc, no auto-dismiss. */
const STICKY = new Set(["penalty"]);

interface Props {
  spec: SystemWindowSpec;
  onAction(action: Action): void;
  onDismiss(): void;
  /** Layout hint: the pop-up window fills its webview; overlay layers use a fixed width. */
  width?: number | string;
}

export function SystemWindow({ spec, onAction, onDismiss, width = 520 }: Props) {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const dismissed = useRef(false);

  const dismiss = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    onDismiss();
  }, [onDismiss]);

  const fire = useCallback(
    (a: Action) => {
      onAction(a);
      if (a.kind !== "progress:goal" && a.kind !== "complete:goal") dismiss();
    },
    [onAction, dismiss],
  );
  // in-block controls (goal logging) never close the window
  const inBlock = useCallback((a: Action) => onAction(a), [onAction]);

  const sticky = STICKY.has(spec.variant);
  const primary = spec.actions.find((a) => a.primary) ?? (spec.actions.length === 1 ? spec.actions[0] : undefined);

  useEffect(() => { playSound(spec.sound); }, [spec.sound]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
      if (e.key === "Escape" && !sticky) { e.preventDefault(); dismiss(); }
      else if (e.key === "Enter" && primary && !typing && el?.tagName !== "BUTTON") { e.preventDefault(); fire(primary); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sticky, primary, fire, dismiss]);

  // auto-dismiss, paused on hover
  const timeout = !sticky && spec.timeoutMs ? spec.timeoutMs : 0;
  useEffect(() => {
    if (!timeout || hover) return;
    const t0 = performance.now() - elapsed;
    const id = setInterval(() => {
      const e = performance.now() - t0;
      setElapsed(e);
      if (e >= timeout) { clearInterval(id); dismiss(); }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeout, hover, dismiss]);

  const glyphKey = spec.glyph ?? DEFAULT_GLYPH[spec.variant] ?? "none";
  const glyphChar = glyphKey === "none" ? null : GLYPH[glyphKey];

  const enter = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.08 } } }
    : {
        initial: { opacity: 0, scaleX: 0.86, scaleY: 0.04, filter: "brightness(3)" },
        animate: {
          opacity: [0, 1, 0.35, 1, 0.6, 1, 1],
          scaleX: [0.86, 1.02, 1.02, 1, 1, 1, 1],
          scaleY: [0.04, 0.9, 0.95, 1, 1, 1, 1],
          filter: ["brightness(3)", "brightness(2)", "brightness(2)", "brightness(1.6)", "brightness(1.3)", "brightness(1.2)", "brightness(1)"],
          transition: { duration: 0.55, times: [0, 0.35, 0.48, 0.58, 0.68, 0.78, 1], ease: "easeOut" as const },
        },
      };

  return (
    <motion.div
      className="sys"
      data-variant={spec.variant}
      role={sticky ? "alertdialog" : "status"}
      aria-live={sticky ? "assertive" : "polite"}
      aria-label={spec.title}
      style={{ width, maxWidth: "100%", maxHeight: "100%", overflow: "auto", transformOrigin: "center" }}
      {...enter}
      exit={{ opacity: 0, scale: reduced ? 1 : 0.97, filter: reduced ? "none" : "brightness(2)", transition: { duration: reduced ? 0.08 : 0.3, ease: "easeIn" } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="sys-scanlines" />
      <div className="scan-line" />
      {spec.generated && <span className="sys-oracle">ORACLE</span>}
      {!sticky && (
        <button className="sys-close" aria-label="Dismiss" onClick={dismiss}>&times;</button>
      )}
      {glyphChar !== null && (
        <div className={`sys-glyph ${glyphKey === "diamond" ? "dia" : ""}`}><span>{glyphChar}</span></div>
      )}
      <h2 className="sys-title">[{spec.title.toUpperCase()}]</h2>
      <hr className="sys-rule" />
      <div className="sys-body">
        {spec.blocks.map((b, i) => {
          const C = BLOCKS[b.type] as React.ComponentType<{ block: typeof b; onAction?: (a: Action) => void }> | undefined;
          return C ? <C key={i} block={b} onAction={inBlock} /> : null;
        })}
      </div>
      {spec.actions.length > 0 && (
        <div className="sys-actions">
          {spec.actions.map((a, i) => (
            <button key={i} className={`sys-btn ${a === primary ? "primary" : ""}`} onClick={() => fire(a)} autoFocus={a === primary}>
              [{a.label.toUpperCase()}]
            </button>
          ))}
        </div>
      )}
      {spec.footer && <p className="sys-footer">&#9888; {spec.footer}</p>}
      {timeout > 0 && <div className="sys-timeout" style={{ width: `${Math.max(0, 100 - (elapsed / timeout) * 100)}%` }} />}
    </motion.div>
  );
}
