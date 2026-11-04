/** Tiny key/value cache for Oracle results (and the daily spend counter). */

export interface OracleCache {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
}

export class MemoryOracleCache implements OracleCache {
  private m = new Map<string, unknown>();
  get<T = unknown>(key: string): T | undefined {
    return this.m.has(key) ? (this.m.get(key) as T) : undefined;
  }
  set(key: string, value: unknown): void {
    this.m.set(key, value);
  }
}

/** localStorage-backed; silently degrades to memory when storage is unavailable. */
export class LocalStorageOracleCache implements OracleCache {
  private fallback = new MemoryOracleCache();
  constructor(private storage: Pick<Storage, "getItem" | "setItem"> | undefined = safeStorage()) {}
  get<T = unknown>(key: string): T | undefined {
    try {
      const raw = this.storage?.getItem(key);
      if (raw != null) return JSON.parse(raw) as T;
    } catch { /* fall through */ }
    return this.fallback.get<T>(key);
  }
  set(key: string, value: unknown): void {
    this.fallback.set(key, value);
    try { this.storage?.setItem(key, JSON.stringify(value)); } catch { /* quota / unavailable */ }
  }
}

function safeStorage(): Storage | undefined {
  try { return typeof localStorage !== "undefined" ? localStorage : undefined; } catch { return undefined; }
}

/** Cache keys: `oracle:<kind>:<date|isoWeek>`. */
export const cacheKey = (kind: string, period: string) => `oracle:${kind}:${period}`;

/** ISO-8601 week id ("2026-W45") for a YYYY-MM-DD date. */
export function isoWeek(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((dt.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
