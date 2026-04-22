'use client';

import { useEffect, useState } from 'react';

const MS_PER_SEC = 1000;
const SECS_PER_MIN = 60;

export function formatCountdown(secondsLeft: number): string {
  const mins = Math.floor(secondsLeft / SECS_PER_MIN);
  const secs = secondsLeft % SECS_PER_MIN;
  return `${String(mins)}:${String(secs).padStart(2, '0')}`;
}

export function computeSecondsLeft(cooldownUntil: string | null): number {
  if (cooldownUntil === null) return 0;
  return Math.max(0, Math.ceil((new Date(cooldownUntil).getTime() - Date.now()) / MS_PER_SEC));
}

export function useCountdown(cooldownUntil: string | null): number {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (cooldownUntil === null) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
    }, MS_PER_SEC);
    return () => {
      clearInterval(id);
    };
  }, [cooldownUntil]);

  return computeSecondsLeft(cooldownUntil);
}
