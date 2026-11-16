/**
 * Header quick bar: "Tell the System what you did…". Enter parses the text with log_text (apply:false)
 * and opens a confirmation System window; ACCEPT logs the entries. Cmd/Ctrl+J focuses it.
 * Also drives the Sunday-evening re-evaluation offer (checked every minute while mounted).
 */
import { useEffect, useRef, useState } from "react";
import { maybeOfferReevaluation } from "../../agent/reevaluate";
import { toolHost } from "../../agent/tools";
import { useUi } from "../../store/ui";

export function QuickBar() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const toast = useUi((u) => u.showToast);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const check = () => { try { maybeOfferReevaluation(); } catch (err) { console.warn("[agent] re-evaluation offer failed", err); } };
    const first = setTimeout(check, 5_000);
    const t = setInterval(check, 60_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const r = await toolHost.execute({ name: "log_text", args: { text: t }, source: "ui" });
      if (r.ok) setText("");
      else toast(r.error ?? "The System could not read that.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-w-[120px] max-w-[340px] flex-1">
      <input
        ref={ref}
        className="sys-input !py-1 !text-[15px]"
        placeholder="Tell the System what you did…"
        aria-label="Tell the System what you did (Ctrl+J)"
        title="e.g. gym done, 40 min study, 2 meals, slept 7 — Enter to confirm (Ctrl/Cmd+J)"
        value={text}
        maxLength={500}
        disabled={busy}
        data-testid="quickbar"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void submit(); }
          if (e.key === "Escape") { setText(""); (e.target as HTMLInputElement).blur(); }
        }}
      />
      {busy && <span className="mono tone-cyan pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px]">[…]</span>}
    </div>
  );
}
