import { useEffect, useState } from 'react';

/**
 * True once `active` has stayed true for `delayMs` — for "this is taking a
 * while, here's why" messages (e.g. a free-tier backend waking from sleep).
 */
export function useSlowHint(active: boolean, delayMs = 5000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active, delayMs]);

  return active && slow;
}
