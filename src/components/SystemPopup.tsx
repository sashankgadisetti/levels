import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { uid } from "../lib/format";
import { EVENTS, emit, hideSystemWindow, listen, SYSTEM_ACTION_EVENT } from "../lib/tauri";
import { parseSpec, type Action, type SystemActionEvent, type SystemWindowSpec } from "../system/spec";
import { SystemWindow } from "./system/SystemWindow";

type Queued = SystemWindowSpec & { id: string };

/** The transparent /system window: renders queued specs one at a time and reports button presses back. */
export function SystemPopup() {
  const [queue, setQueue] = useState<Queued[]>([]);
  const queueRef = useRef<Queued[]>([]);
  queueRef.current = queue;

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
  const onAction = useCallback(
    (action: Action) => { void emit(SYSTEM_ACTION_EVENT, { windowId: current?.id, action } satisfies SystemActionEvent); },
    [current?.id],
  );
  const onDismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  return (
    <div className="h-full w-full p-3">
      <AnimatePresence mode="wait" onExitComplete={() => { if (queueRef.current.length === 0) void hideSystemWindow(); }}>
        {current && <SystemWindow key={current.id} spec={current} width="100%" onAction={onAction} onDismiss={onDismiss} />}
      </AnimatePresence>
    </div>
  );
}
