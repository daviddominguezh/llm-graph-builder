import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Returns the current timestamp (Date.now()), refreshed on a fixed interval.
 *
 * @param intervalMs - How often to refresh the timestamp (default: 60000ms = 1 minute)
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  const update = useCallback(() => {
    setNow(Date.now());
  }, []);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(update, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [intervalMs, update]);

  return now;
}
