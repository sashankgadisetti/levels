/** Time helpers. Plain Date math in the local timezone; the "player day" rolls over at dayEndsAt. */
import type { ISO, Weekday, YMD } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
export const parseHM = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return { h: h || 0, m: m || 0, minutes: (h || 0) * 60 + (m || 0) };
};
const parseYMD = (d: YMD) => { const [y, m, dd] = d.split("-").map(Number); return { y, m, d: dd }; };
const fmt = (dt: Date) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

export function addDays(date: YMD, n: number): YMD {
  const { y, m, d } = parseYMD(date);
  return fmt(new Date(Date.UTC(y, m - 1, d + n)));
}
export function daysBetween(a: YMD, b: YMD): number {
  const pa = parseYMD(a), pb = parseYMD(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** The player-day a timestamp belongs to. With dayEndsAt "03:00", 02:59 belongs to the previous date. */
export function localDate(at: ISO | Date, dayEndsAt: string): YMD {
  const d = at instanceof Date ? at : new Date(at);
  const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return d.getHours() * 60 + d.getMinutes() < parseHM(dayEndsAt).minutes ? addDays(base, -1) : base;
}

/** [start, end) of a player-day as ISO instants (local time). */
export function dayBounds(date: YMD, dayEndsAt: string): { start: ISO; end: ISO } {
  const { y, m, d } = parseYMD(date);
  const { h, m: mi } = parseHM(dayEndsAt);
  return {
    start: new Date(y, m - 1, d, h, mi, 0, 0).toISOString(),
    end: new Date(y, m - 1, d + 1, h, mi, 0, 0).toISOString(),
  };
}

const WD: Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function weekdayOf(date: YMD): Weekday {
  const { y, m, d } = parseYMD(date);
  return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** ISO-8601 week label, e.g. "2026-W45". */
export function isoWeek(date: YMD): string {
  const { y, m, d } = parseYMD(date);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((dt.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${pad(week)}`;
}

export const monthOf = (date: YMD) => date.slice(0, 7);
export const addHours = (at: ISO, h: number): ISO => new Date(new Date(at).getTime() + h * 3_600_000).toISOString();

/** Is `at` inside quiet hours ("22:30"–"06:30", may wrap midnight)? */
export function inQuietHours(at: ISO, q?: { from: string; to: string }): boolean {
  if (!q) return false;
  const d = new Date(at);
  const t = d.getHours() * 60 + d.getMinutes();
  const f = parseHM(q.from).minutes, e = parseHM(q.to).minutes;
  if (f === e) return false;
  return f < e ? t >= f && t < e : t >= f || t < e;
}
