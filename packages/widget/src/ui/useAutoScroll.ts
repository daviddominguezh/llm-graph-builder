import { type RefObject, useEffect, useRef } from 'react';

const STUCK_THRESHOLD_PX = 80;

// Auto-scrolls to the sentinel when `dep` changes, but only while the user
// is "stuck" to the bottom. Scrolling up past STUCK_THRESHOLD_PX disables
// auto-scroll until the user scrolls back down, so reading earlier content
// during a stream isn't yanked away on every new token.
export function useAutoScroll(
  dep: unknown,
  containerRef: RefObject<HTMLDivElement | null>
): RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(true);

  useEffect(() => {
    const { current: container } = containerRef;
    if (container === null) return undefined;
    const onScroll = (): void => {
      const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
      stuckRef.current = distance < STUCK_THRESHOLD_PX;
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
    };
  }, [containerRef]);

  useEffect(() => {
    if (stuckRef.current) {
      sentinelRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [dep]);

  return sentinelRef;
}
