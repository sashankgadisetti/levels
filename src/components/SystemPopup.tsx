import { useEffect, useState } from "react";
import { EVENTS, listen } from "../lib/tauri";

export function SystemPopup() {
  const [payload, setPayload] = useState<unknown>(null);

  useEffect(() => {
    const p = listen<unknown>(EVENTS.systemWindow, setPayload);
    return () => { p.then((un) => un()); };
  }, []);

  return (
    <div className="h-full p-2">
      <div className="h-full border border-sl-cyan bg-sl-panel text-sl-cyan p-4 font-mono text-sm overflow-auto shadow-[0_0_24px_rgba(63,216,255,0.35)]">
        <pre className="whitespace-pre-wrap">{JSON.stringify(payload, null, 2)}</pre>
      </div>
    </div>
  );
}
