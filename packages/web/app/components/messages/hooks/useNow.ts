import { useSyncExternalStore } from 'react';

/**
 * Returns the current timestamp (Date.now()) in a React Compiler-safe way.
 *
 * Uses `useSyncExternalStore` so the impure Date.now() call is handled
 * through the proper external-store subscription mechanism rather than
 * being called directly during render.
 *
 * @param intervalMs - How often to refresh the timestamp (default: 60000ms = 1 minute)
 */
export function useNow(intervalMs = 60_000): number {
  return useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, intervalMs);
      return () => clearInterval(id);
    },
    () => Date.now(),
    () => Date.now()
  );
}
