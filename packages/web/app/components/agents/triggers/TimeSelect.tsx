'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const MINUTE_STEP = 5;
const PAD = 2;
const RADIX = 10;

const HOURS = Array.from({ length: HOURS_PER_DAY }, (_, i) => String(i).padStart(PAD, '0'));
const MINUTES = Array.from({ length: MINUTES_PER_HOUR / MINUTE_STEP }, (_, i) =>
  String(i * MINUTE_STEP).padStart(PAD, '0')
);

interface TimeSelectProps {
  value: string;
  onChange: (next: string) => void;
  minTime?: string;
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

function filterHours(minTime: string | undefined): string[] {
  if (!minTime) return HOURS;
  const { h } = splitTime(minTime);
  const minHour = parseInt(h, RADIX);
  return HOURS.filter((hh) => parseInt(hh, RADIX) >= minHour);
}

function filterMinutes(currentHour: string, minTime: string | undefined): string[] {
  if (!minTime) return MINUTES;
  const { h, m } = splitTime(minTime);
  if (currentHour !== h) return MINUTES;
  const minMinute = parseInt(m, RADIX);
  return MINUTES.filter((mm) => parseInt(mm, RADIX) >= minMinute);
}

export function TimeSelect({ value, onChange, minTime }: TimeSelectProps) {
  const { h, m } = splitTime(value);
  const hourOptions = filterHours(minTime);
  const minuteOptions = filterMinutes(h, minTime);
  return (
    <span className="inline-flex items-center">
      <PartSelect
        value={h}
        options={hourOptions}
        onChange={(nh) => onChange(`${nh}:${m}`)}
        ariaLabel="Hour"
      />
      <span className="px-1 text-muted-foreground">:</span>
      <PartSelect
        value={m}
        options={minuteOptions}
        onChange={(nm) => onChange(`${h}:${nm}`)}
        ariaLabel="Minute"
      />
    </span>
  );
}
