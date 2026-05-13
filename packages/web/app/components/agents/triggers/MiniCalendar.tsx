'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import dayjs, { type Dayjs } from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

const DAYS_IN_WEEK = 7;
const TOTAL_CELLS = 42;
const MONTH_FORMAT = 'MMMM YYYY';
const WEEK_START_MONDAY = 1;

interface MiniCalendarProps {
  value: Dayjs | null;
  onChange: (next: Dayjs) => void;
}

function buildMonthCells(viewMonth: Dayjs, weekStart: number): Dayjs[] {
  const firstOfMonth = viewMonth.startOf('month');
  const offset = (firstOfMonth.day() - weekStart + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const start = firstOfMonth.subtract(offset, 'day');
  return Array.from({ length: TOTAL_CELLS }, (_, i) => start.add(i, 'day'));
}

function weekdayLabels(weekStart: number): string[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, i) =>
    dayjs()
      .day((weekStart + i) % DAYS_IN_WEEK)
      .locale('en')
      .format('dd')
      .charAt(0)
  );
}

function CalendarHeader({ viewMonth, setViewMonth }: { viewMonth: Dayjs; setViewMonth: (d: Dayjs) => void }) {
  return (
    <div className="flex items-center justify-between px-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={() => setViewMonth(viewMonth.subtract(1, 'month'))}
        aria-label="Previous month"
      >
        <ChevronLeft className="size-3.5" />
      </Button>
      <span className="text-sm font-semibold tracking-tight tabular-nums">
        {viewMonth.locale('en').format(MONTH_FORMAT)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={() => setViewMonth(viewMonth.add(1, 'month'))}
        aria-label="Next month"
      >
        <ChevronRight className="size-3.5" />
      </Button>
    </div>
  );
}

function DayCell({
  day,
  viewMonth,
  today,
  selected,
  onSelect,
}: {
  day: Dayjs;
  viewMonth: Dayjs;
  today: Dayjs;
  selected: Dayjs | null;
  onSelect: (d: Dayjs) => void;
}) {
  const isOtherMonth = day.month() !== viewMonth.month();
  const isToday = day.isSame(today, 'day');
  const isSelected = selected !== null && day.isSame(selected, 'day');
  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      aria-label={day.locale('en').format('dddd, MMMM D, YYYY')}
      aria-pressed={isSelected}
      className={cn(
        'h-7 w-7 rounded-md text-xs cursor-pointer tabular-nums outline-none transition duration-150 ease-out',
        'focus-visible:ring-2 focus-visible:ring-ring/40 active:scale-90',
        'motion-reduce:transform-none motion-reduce:transition-none',
        isOtherMonth && 'text-muted-foreground/40',
        !isOtherMonth && !isSelected && 'text-foreground hover:bg-input',
        isToday && !isSelected && 'font-semibold text-primary',
        isSelected && 'bg-primary text-primary-foreground font-semibold'
      )}
    >
      {day.date()}
    </button>
  );
}

export function MiniCalendar({ value, onChange }: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = useState<Dayjs>(value ?? dayjs());
  const cells = buildMonthCells(viewMonth, WEEK_START_MONDAY);
  const labels = weekdayLabels(WEEK_START_MONDAY);
  const today = dayjs();
  return (
    <div className="flex w-60 flex-col gap-2">
      <CalendarHeader viewMonth={viewMonth} setViewMonth={setViewMonth} />
      <div className="grid grid-cols-7 gap-y-0.5">
        {labels.map((l, i) => (
          <div
            key={i}
            className="flex h-6 items-center justify-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70"
          >
            {l}
          </div>
        ))}
        {cells.map((d) => (
          <DayCell
            key={d.format('YYYY-MM-DD')}
            day={d}
            viewMonth={viewMonth}
            today={today}
            selected={value}
            onSelect={onChange}
          />
        ))}
      </div>
    </div>
  );
}
