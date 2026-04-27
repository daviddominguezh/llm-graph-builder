import dayjs, { type Dayjs } from 'dayjs';

import type { RecurringConfig, TriggerFormState, Weekday } from './types';

const DAYS_IN_WEEK = 7;
const FIRST_OF_MONTH = 1;
const TIME_RESET_SECOND = 0;
const TIME_RESET_MS = 0;
const RADIX = 10;
const HOUR_FALLBACK = 0;
const MINUTE_FALLBACK = 0;
const EMPTY_LIST = 0;

const WEEKDAY_ORDER: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function weekdayIndex(weekday: Weekday): number {
  return WEEKDAY_ORDER.indexOf(weekday);
}

function parseHourMinute(time: string): { hour: number; minute: number } {
  const [hRaw = '', mRaw = ''] = time.split(':');
  const h = parseInt(hRaw, RADIX);
  const m = parseInt(mRaw, RADIX);
  return {
    hour: Number.isFinite(h) ? h : HOUR_FALLBACK,
    minute: Number.isFinite(m) ? m : MINUTE_FALLBACK,
  };
}

function applyTimeOfDay(d: Dayjs, time: string): Dayjs {
  const { hour, minute } = parseHourMinute(time);
  return d.hour(hour).minute(minute).second(TIME_RESET_SECOND).millisecond(TIME_RESET_MS);
}

function nextDays(cfg: RecurringConfig, now: Dayjs): Dayjs {
  const today = applyTimeOfDay(now, cfg.time);
  return today.isAfter(now) ? today : today.add(cfg.interval, 'day');
}

function nextWeekday(weekday: Weekday, time: string, now: Dayjs): Dayjs {
  const target = weekdayIndex(weekday);
  const base = applyTimeOfDay(now, time);
  const daysUntil = (target - base.day() + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  const candidate = base.add(daysUntil, 'day');
  return candidate.isAfter(now) ? candidate : candidate.add(DAYS_IN_WEEK, 'day');
}

function nextWeeks(cfg: RecurringConfig, now: Dayjs): Dayjs | null {
  if (cfg.weekdays.length === EMPTY_LIST) return null;
  const candidates = cfg.weekdays.map((w) => nextWeekday(w, cfg.time, now));
  return candidates.reduce((earliest, c) => (c.isBefore(earliest) ? c : earliest));
}

function monthSlot(base: Dayjs, dayOfMonth: number, time: string): Dayjs {
  const lastDay = base.daysInMonth();
  const day = Math.min(dayOfMonth, lastDay);
  return applyTimeOfDay(base.date(day), time);
}

function nextMonths(cfg: RecurringConfig, now: Dayjs): Dayjs {
  let target = monthSlot(now, cfg.dayOfMonth, cfg.time);
  while (!target.isAfter(now)) {
    const startOfNext = target.add(cfg.interval, 'month').date(FIRST_OF_MONTH);
    target = monthSlot(startOfNext, cfg.dayOfMonth, cfg.time);
  }
  return target;
}

function nextRecurring(cfg: RecurringConfig, now: Dayjs): Dayjs | null {
  if (cfg.unit === 'minutes') return now.add(cfg.interval, 'minute');
  if (cfg.unit === 'hours') return now.add(cfg.interval, 'hour');
  if (cfg.unit === 'days') return nextDays(cfg, now);
  if (cfg.unit === 'weeks') return nextWeeks(cfg, now);
  return nextMonths(cfg, now);
}

function nextOnce(value: string, now: Dayjs): Dayjs | null {
  if (value === '') return null;
  const target = dayjs(value);
  return target.isValid() && target.isAfter(now) ? target : null;
}

export function computeNextRun(state: TriggerFormState, now: Dayjs = dayjs()): Dayjs | null {
  if (state.mode === 'recurring') return nextRecurring(state.recurring, now);
  if (state.mode === 'once') return nextOnce(state.onceDateTime, now);
  return null;
}
