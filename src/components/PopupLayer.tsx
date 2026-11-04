import { AnimatePresence } from "motion/react";
import { handleAction } from "../store/actions";
import { usePopups } from "../store/popups";
import { SystemWindow } from "./system/SystemWindow";

/** Browser fallback for the Tauri System window: one pop-up at a time, top-right of the main window. */
export function PopupLayer() {
  const current = usePopups((s) => s.queue[0]);
  const shift = usePopups((s) => s.shift);
  return (
    <div className="pointer-events-none fixed right-6 top-20 z-[60] flex max-h-[calc(100vh-6rem)] w-[min(460px,calc(100vw-2rem))] justify-end">
      <div className="pointer-events-auto w-full">
        <AnimatePresence mode="wait">
          {current && <SystemWindow key={current.id} spec={current} width="100%" onAction={handleAction} onDismiss={shift} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
