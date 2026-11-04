import { AnimatePresence } from "motion/react";
import { handleAction } from "../store/actions";
import { usePopups, type QueuedSpec } from "../store/popups";
import { SystemWindow } from "./system/SystemWindow";

/** Browser fallback for the Tauri System window: one pop-up at a time, top-right of the main window. */
export function PopupLayer() {
  const current = usePopups((s) => s.queue[0]);
  const shift = usePopups((s) => s.shift);
  return (
    <div className="pointer-events-none fixed right-6 top-20 z-[60] flex max-h-[calc(100vh-6rem)] w-[min(460px,calc(100vw-2rem))] justify-end">
      <div className="pointer-events-auto w-full">
        <AnimatePresence mode="wait">
          {current && <Layered key={current.id} spec={current} onDismiss={shift} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Layered({ spec, onDismiss }: { spec: QueuedSpec; onDismiss(): void }) {
  return <SystemWindow spec={spec} width="100%" maxHeight="calc(100vh - 6rem)" onAction={(a) => handleAction(a, { windowId: spec.id })} onDismiss={onDismiss} />;
}
