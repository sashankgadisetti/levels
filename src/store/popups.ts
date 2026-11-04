/** Overlay popup queue used by the main window when there is no Tauri System window (plain browser). */
import { create } from "zustand";
import type { SystemWindowSpec } from "../system/spec";

export type QueuedSpec = SystemWindowSpec & { id: string };

export const usePopups = create<{
  queue: QueuedSpec[];
  push(spec: QueuedSpec): void;
  shift(): void;
  clear(): void;
}>((set) => ({
  queue: [],
  push: (spec) => set((s) => (s.queue.some((x) => x.id === spec.id) ? { queue: s.queue.map((x) => (x.id === spec.id ? spec : x)) } : { queue: [...s.queue, spec] })),
  shift: () => set((s) => ({ queue: s.queue.slice(1) })),
  clear: () => set({ queue: [] }),
}));
