import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { uid } from "../lib/format";
import { EVENTS, emit, hideSystemWindow, listen, SYSTEM_ACTION_EVENT } from "../lib/tauri";
import { clampSize, fitSystemWindow, POPUP_MAX, POPUP_PAD } from "../lib/popupWindow";
import { parseSpec, type Action, type SystemActionEvent, type SystemWindowSpec } from "../system/spec";
import { SystemWindow } from "./system/SystemWindow";

type Queued = SystemWindowSpec & { id: string };

/** Text-only notices read best narrow; anything with rows or buttons gets the standard width. */
const widthFor = (spec?: Queued) => (!spec ? 440 : spec.blocks.length <= 2 && spec.blocks.every((b) => b.type === "text") ? 400 : spec.blocks.some((b) => b.type === "goalRow" || b.type === "itemCard") ? 500 : 440);

/** The transparent /system window: renders queued specs one at a time and reports button presses back. */
export function SystemPopup() {
  const [queue, setQueue] = useState<Queued[]>([]);
  const queueRef = useRef<Queued[]>([]);
  queueRef.current = queue;
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const p = listen<unknown>(EVENTS.systemWindow, (payload) => {
      const parsed = parseSpec(payload);
      if (!parsed.success) { console.warn("[system] rejected spec", parsed.error); return; }
      const spec = { ...parsed.data, id: parsed.data.id ?? uid() };
      setQueue((q) => (q.some((x) => x.id === spec.id) ? q.map((x) => (x.id === spec.id ? spec : x)) : [...q, spec]));
    });
    return () => { p.then((un) => un()); };
  }, []);

  const current = queue[0];
  const width = widthFor(current);

  // Fit the OS window to the rendered content (min 360x160, max 560x700 logical px), anchored top-right.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const h = el.offsetHeight || r.height;
        void fitSystemWindow(el.offsetWidth + POPUP_PAD * 2, h + POPUP_PAD * 2);
      });
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [width]);

  const onAction = useCallback(
    (action: Action) => { void emit(SYSTEM_ACTION_EVENT, { windowId: current?.id, action } satisfies SystemActionEvent); },
    [current?.id],
  );
  const onDismiss = useCallback(() => setQueue((q) => q.slice(1)), []);
  const maxInner = clampSize(0, POPUP_MAX.h).h - POPUP_PAD * 2;

  return (
    <div className="h-full w-full overflow-hidden" style={{ padding: POPUP_PAD }}>
      <div ref={boxRef} style={{ width: Math.min(width, POPUP_MAX.w - POPUP_PAD * 2), marginLeft: "auto" }}>
        <AnimatePresence mode="wait" onExitComplete={() => { if (queueRef.current.length === 0) void hideSystemWindow(); }}>
          {current && <SystemWindow key={current.id} spec={current} width="100%" maxHeight={maxInner} onAction={onAction} onDismiss={onDismiss} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
