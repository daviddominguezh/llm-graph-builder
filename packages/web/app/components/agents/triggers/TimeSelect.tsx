'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const MINUTE_STEP = 5;
const PAD = 2;

const HOURS = Array.from({ length: HOURS_PER_DAY }, (_, i) => String(i).padStart(PAD, '0'));
const MINUTES = Array.from({ length: MINUTES_PER_HOUR / MINUTE_STEP }, (_, i) =>
  String(i * MINUTE_STEP).padStart(PAD, '0')
);

interface TimeSelectProps {
  value: string;
  onChange: (next: string) => void;
}

function splitTime(value: string): { h: string; m: string } {
  const [hRaw, mRaw] = value.split(':');
  return { h: hRaw && hRaw.length === PAD ? hRaw : '09', m: mRaw && mRaw.length === PAD ? mRaw : '00' };
}

function PartSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-7 w-14 justify-center px-2 text-sm font-medium tabular-nums [&_span]:text-sm"
      >
        <SelectValue>{value}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="text-sm tabular-nums">
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TimeSelect({ value, onChange }: TimeSelectProps) {
  const { h, m } = splitTime(value);
  return (
    <span className="inline-flex items-center">
      <PartSelect value={h} options={HOURS} onChange={(nh) => onChange(`${nh}:${m}`)} ariaLabel="Hour" />
      <span className="px-1 text-muted-foreground">:</span>
      <PartSelect value={m} options={MINUTES} onChange={(nm) => onChange(`${h}:${nm}`)} ariaLabel="Minute" />
    </span>
  );
}
