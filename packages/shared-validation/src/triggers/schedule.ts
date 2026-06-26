import dayjs, { type Dayjs } from 'dayjs';
import { z } from 'zod';

export type ScheduleMode = 'recurring' | 'once' | 'after-event';
export type RecurringUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const SCHEDULE_MODES: ScheduleMode[] = ['recurring', 'once', 'after-event'];
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const RECURRING_UNITS: RecurringUnit[] = ['minutes', 'hours', 'days', 'weeks', 'months'];

export interface RecurringConfig {
  unit: RecurringUnit;
  interval: number;
  weekdays: Weekday[];
  dayOfMonth: number;
  time: string;
  startAt: string;
  endAt: string;
}

/** Flat shape consumed by the schedule math (the form carries all fields). */
export interface TriggerScheduleInput {
  mode: ScheduleMode;
  recurring: RecurringConfig;
  onceDateTime: string;
}

/** Clean domain union (no illegal states) — used at persistence/domain boundaries. */
export type TriggerSchedule =
  | { mode: 'recurring'; recurring: RecurringConfig }
  | { mode: 'once'; onceDateTime: string }
  | { mode: 'after-event' };

const RecurringConfigSchema = z.object({
  unit: z.enum(['minutes', 'hours', 'days', 'weeks', 'months']),
  interval: z.number().int().positive(),
  weekdays: z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])),
  dayOfMonth: z.number().int().min(1).max(31),
  time: z.string(),
  startAt: z.string(),
  endAt: z.string(),
});

export const TriggerScheduleSchema: z.ZodType<TriggerSchedule> = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('recurring'), recurring: RecurringConfigSchema }),
  z.object({ mode: z.literal('once'), onceDateTime: z.string().min(1) }),
  z.object({ mode: z.literal('after-event') }),
]);

export function toTriggerSchedule(input: TriggerScheduleInput): TriggerSchedule {
  switch (input.mode) {
    case 'recurring':
      return { mode: 'recurring', recurring: input.recurring };
    case 'once':
      return { mode: 'once', onceDateTime: input.onceDateTime };
    case 'after-event':
      return { mode: 'after-event' };
    default: {
      const _exhaustive: never = input.mode;
      return _exhaustive;
    }
  }
}

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

function parseStartAt(value: string): Dayjs | null {
  if (value === '') return null;
  const d = dayjs(value);
  return d.isValid() ? d : null;
}

function alignedNext(startAt: Dayjs, interval: number, unit: 'minute' | 'hour', now: Dayjs): Dayjs {
  const elapsed = now.diff(startAt, unit);
  const slotsElapsed = Math.floor(elapsed / interval) + 1;
  return startAt.add(slotsElapsed * interval, unit);
}

function nextFromAnchor(cfg: RecurringConfig, startAt: Dayjs | null, now: Dayjs): Dayjs | null {
  if (cfg.unit === 'minutes') {
    return startAt ? alignedNext(startAt, cfg.interval, 'minute', now) : now.add(cfg.interval, 'minute');
  }
  if (cfg.unit === 'hours') {
    return startAt ? alignedNext(startAt, cfg.interval, 'hour', now) : now.add(cfg.interval, 'hour');
  }
  if (cfg.unit === 'days') return nextDays(cfg, now);
  if (cfg.unit === 'weeks') return nextWeeks(cfg, now);
  return nextMonths(cfg, now);
}

function hasTickAnchor(unit: RecurringConfig['unit']): boolean {
  return unit === 'minutes' || unit === 'hours';
}

function nextRecurring(cfg: RecurringConfig, now: Dayjs): Dayjs | null {
  const startAt = parseStartAt(cfg.startAt);
  if (!startAt) return nextFromAnchor(cfg, null, now);
  if (startAt.isAfter(now) && hasTickAnchor(cfg.unit)) return startAt;
  return nextFromAnchor(cfg, startAt, now);
}

function nextOnce(value: string, now: Dayjs): Dayjs | null {
  if (value === '') return null;
  const target = dayjs(value);
  return target.isValid() && target.isAfter(now) ? target : null;
}

export function computeNextRun(state: TriggerScheduleInput, now: Dayjs = dayjs()): Dayjs | null {
  if (state.mode === 'recurring') return nextRecurring(state.recurring, now);
  if (state.mode === 'once') return nextOnce(state.onceDateTime, now);
  return null;
}

function previewCursor(state: TriggerScheduleInput, now: Dayjs): Dayjs {
  if (state.mode !== 'recurring') return now;
  const startAt = parseStartAt(state.recurring.startAt);
  if (!startAt) return now;
  return startAt.subtract(1, 'millisecond');
}

function recurringEndAt(state: TriggerScheduleInput): Dayjs | null {
  if (state.mode !== 'recurring') return null;
  return parseStartAt(state.recurring.endAt);
}

const MAX_PREVIEW_ITERATIONS = 2000;

export interface PreviewRunItem {
  date: Dayjs;
  index: number;
}

export interface PreviewRuns {
  first: PreviewRunItem[];
  last: PreviewRunItem[];
  hasGap: boolean;
}

interface PreviewSpec {
  firstCount: number;
  lastCount: number;
  now: Dayjs;
}

function pushSliding(buf: PreviewRunItem[], next: PreviewRunItem, max: number): void {
  buf.push(next);
  if (buf.length > max) buf.shift();
}

function collectRuns(
  state: TriggerScheduleInput,
  spec: PreviewSpec
): { first: PreviewRunItem[]; last: PreviewRunItem[]; total: number } {
  const endAt = recurringEndAt(state);
  const wantsLast = state.mode === 'recurring' && endAt !== null && spec.lastCount > 0;
  const first: PreviewRunItem[] = [];
  const last: PreviewRunItem[] = [];
  let cursor = previewCursor(state, spec.now);
  let total = 0;
  for (let i = 0; i < MAX_PREVIEW_ITERATIONS; i += 1) {
    const next = computeNextRun(state, cursor);
    if (!next) break;
    if (endAt && next.isAfter(endAt)) break;
    total += 1;
    const item: PreviewRunItem = { date: next, index: total };
    if (first.length < spec.firstCount) first.push(item);
    else if (wantsLast) pushSliding(last, item, spec.lastCount);
    else break;
    if (state.mode !== 'recurring') break;
    cursor = next;
  }
  return { first, last, total };
}

export function computePreviewRuns(
  state: TriggerScheduleInput,
  firstCount: number,
  lastCount: number,
  now: Dayjs = dayjs()
): PreviewRuns {
  const endAt = recurringEndAt(state);
  const { first, last, total } = collectRuns(state, { firstCount, lastCount, now });
  const hasUnbounded = state.mode === 'recurring' && endAt === null && first.length === firstCount;
  const hasGap = hasUnbounded || total > first.length + last.length;
  return { first, last, hasGap };
}

const MS_PER_SECOND = 1000;

/** Backend entrypoint: whole-second JS Date (or null). */
export function computeNextRunAt(input: TriggerScheduleInput, now: Date): Date | null {
  const next = computeNextRun(input, dayjs(now));
  if (next === null) return null;
  return new Date(Math.floor(next.valueOf() / MS_PER_SECOND) * MS_PER_SECOND);
}

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic, bounded, whole-second jitter. Caller applies to recurring only. */
export function applyJitter(date: Date, seed: string, windowMs: number): Date {
  if (windowMs <= 0) return date;
  const offsetMs = hashSeed(seed) % windowMs;
  const jittered = date.getTime() + offsetMs;
  return new Date(Math.floor(jittered / MS_PER_SECOND) * MS_PER_SECOND);
}
