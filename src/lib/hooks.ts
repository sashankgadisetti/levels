import { nowMs } from "../store/game";
import { useEffect, useState } from "react";

/** Re-renders every `ms` with the current time. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date(nowMs()));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date(nowMs())), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
