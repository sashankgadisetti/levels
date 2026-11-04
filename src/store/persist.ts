/**
 * Persistence adapters. The event log is the source of truth; a snapshot is a cache.
 *  - Tauri:   @tauri-apps/plugin-sql, sqlite:levels.db  (events + snapshot tables)
 *  - Browser: localStorage
 */
import type { Event, State } from "../engine";
import { isTauri } from "../lib/tauri";

export interface Persistence {
  loadSnapshot(): Promise<State | undefined>;
  loadEvents(): Promise<Event[]>;
  appendEvent(e: Event): Promise<void>;
  appendEvents(es: Event[]): Promise<void>;
  saveSnapshot(s: State): Promise<void>;
  clear(): Promise<void>;
}

/* ---------------- localStorage ---------------- */
export const LS_EVENTS = "levels.events";
export const LS_SNAPSHOT = "levels.snapshot";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createLocalStoragePersistence(storage: StorageLike = localStorage): Persistence {
  const readEvents = (): Event[] => {
    try { return JSON.parse(storage.getItem(LS_EVENTS) ?? "[]") as Event[]; } catch { return []; }
  };
  return {
    async loadSnapshot() {
      try {
        const raw = storage.getItem(LS_SNAPSHOT);
        return raw ? (JSON.parse(raw) as State) : undefined;
      } catch { return undefined; }
    },
    async loadEvents() { return readEvents(); },
    async appendEvent(e) { storage.setItem(LS_EVENTS, JSON.stringify([...readEvents(), e])); },
    async appendEvents(es) { storage.setItem(LS_EVENTS, JSON.stringify([...readEvents(), ...es])); },
    async saveSnapshot(s) { storage.setItem(LS_SNAPSHOT, JSON.stringify(s)); },
    async clear() { storage.removeItem(LS_EVENTS); storage.removeItem(LS_SNAPSHOT); },
  };
}

/* ---------------- sqlite (tauri-plugin-sql) ---------------- */
/** The slice of tauri-plugin-sql's Database we use (so it can be faked in tests). */
export interface SqlLike {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}

export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, at TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL)",
];

export async function createSqlPersistence(db: SqlLike): Promise<Persistence> {
  for (const q of SCHEMA) await db.execute(q);
  const insert = (e: Event) => db.execute("INSERT INTO events (at, type, payload) VALUES ($1, $2, $3)", [e.at, e.type, JSON.stringify(e)]);
  return {
    async loadSnapshot() {
      const rows = await db.select<{ state: string }[]>("SELECT state FROM snapshot WHERE id = 1");
      return rows[0] ? (JSON.parse(rows[0].state) as State) : undefined;
    },
    async loadEvents() {
      const rows = await db.select<{ payload: string }[]>("SELECT payload FROM events ORDER BY id ASC");
      return rows.map((r) => JSON.parse(r.payload) as Event);
    },
    async appendEvent(e) { await insert(e); },
    async appendEvents(es) { for (const e of es) await insert(e); },
    async saveSnapshot(s) {
      await db.execute("INSERT INTO snapshot (id, state) VALUES (1, $1) ON CONFLICT(id) DO UPDATE SET state = excluded.state", [JSON.stringify(s)]);
    },
    async clear() {
      await db.execute("DELETE FROM events");
      await db.execute("DELETE FROM snapshot");
    },
  };
}

/** In-memory adapter (tests, ?fixture mode). */
export function createMemoryPersistence(): Persistence & { events: Event[]; snapshot?: State } {
  const m = {
    events: [] as Event[],
    snapshot: undefined as State | undefined,
    async loadSnapshot() { return m.snapshot; },
    async loadEvents() { return [...m.events]; },
    async appendEvent(e: Event) { m.events.push(e); },
    async appendEvents(es: Event[]) { m.events.push(...es); },
    async saveSnapshot(s: State) { m.snapshot = s; },
    async clear() { m.events = []; m.snapshot = undefined; },
  };
  return m;
}

/** Picks the right adapter for the current runtime. */
export async function createPersistence(): Promise<Persistence> {
  if (isTauri()) {
    try {
      const { default: Database } = await import("@tauri-apps/plugin-sql");
      return await createSqlPersistence(await Database.load("sqlite:levels.db"));
    } catch (err) {
      console.error("[levels] sqlite unavailable, falling back to localStorage", err);
    }
  }
  return createLocalStoragePersistence();
}
