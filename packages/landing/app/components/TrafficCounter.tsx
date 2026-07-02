'use client';

import { useEffect, useState } from 'react';

const BASE_VALUE = 1.67421752;
const TICK_MS = 150;

// Live-ticking stat in the hero eyebrow, mirroring the reference's counter.
export function TrafficCounter() {
  const [value, setValue] = useState(BASE_VALUE);

  useEffect(() => {
    const id = setInterval(() => {
      setValue((v) => v + Math.random() * 2e-6);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  return <span className="text-sm tabular-nums text-[#64748d]">{value.toFixed(8)}%</span>;
}
