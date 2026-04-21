import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 600;
const FRAME_INTERVAL = 16;
const TOTAL_FRAMES = Math.ceil(DURATION_MS / FRAME_INTERVAL);

function easeOutQuart(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv * inv;
}

export function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const start = prevTarget.current;
    prevTarget.current = target;
    if (target === start) return;

    let frame = 0;
    const id = setInterval(() => {
      frame++;
      const progress = easeOutQuart(Math.min(frame / TOTAL_FRAMES, 1));
      setValue(start + (target - start) * progress);
      if (frame >= TOTAL_FRAMES) clearInterval(id);
    }, FRAME_INTERVAL);

    return () => clearInterval(id);
  }, [target]);

  return value;
}
