export const pad2 = (n: number) => String(n).padStart(2, "0");

/** 12345 seconds -> "03:25:45" */
export function fmtHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
}

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const pct = (v: number, max: number) => (max > 0 ? clamp((v / max) * 100, 0, 100) : 0);

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const usd = (n: number) => `$${n.toFixed(Number.isInteger(n) ? 0 : 2)}`;
