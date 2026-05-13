'use client';

import { Input } from '@/components/ui/input';

interface IntervalInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
}

const DEFAULT_MIN = 1;
const RADIX = 10;
const NO_SPINNERS =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

function clamp(n: number, min: number, max: number | undefined): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

export function IntervalInput({ value, onChange, min = DEFAULT_MIN, max, ariaLabel }: IntervalInputProps) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(clamp(parseInt(e.target.value, RADIX), min, max))}
      className={`h-7 w-14 px-2 text-center text-sm font-medium tabular-nums ${NO_SPINNERS}`}
    />
  );
}
