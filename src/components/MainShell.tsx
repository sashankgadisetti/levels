import { useEffect, useState } from "react";
import { EVENTS, listen } from "../lib/tauri";

const NAV = ["Status", "Daily Quest", "Shop", "Inventory", "Shadows", "Settings"] as const;

export function MainShell() {
  const [active, setActive] = useState<(typeof NAV)[number]>("Status");

  useEffect(() => {
    const subs = [
      listen(EVENTS.openStatus, () => setActive("Status")),
      listen(EVENTS.showDailyQuest, () => setActive("Daily Quest")),
      listen(EVENTS.toggleStatus, () => setActive("Status")),
    ];
    return () => { subs.forEach((p) => p.then((un) => un())); };
  }, []);

  return (
    <div className="flex h-full bg-sl-bg text-sl-cyan font-ui">
      <nav className="w-52 border-r border-sl-cyan-dim/40 bg-sl-panel p-4 flex flex-col gap-1">
        <h1 className="font-display text-lg tracking-widest mb-4">LEVELS</h1>
        {NAV.map((n) => (
          <button
            key={n}
            onClick={() => setActive(n)}
            className={`text-left px-3 py-2 uppercase tracking-wider border-l-2 ${
              active === n ? "border-sl-cyan bg-sl-cyan/10" : "border-transparent text-sl-cyan-dim hover:text-sl-cyan"
            }`}
          >
            {n}
          </button>
        ))}
      </nav>
      <main className="flex-1 p-8">
        <p className="font-mono">[SYSTEM] Initializing…</p>
      </main>
    </div>
  );
}
