import { useEffect, useState } from "react";

/**
 * A shared clock for timelock countdowns. Components still treat the contract's
 * timestamp as authoritative; this only updates the display while it waits.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
