import type { AvailableSlot } from '../../types/calendar.js';

const MAX_SLOTS = 3;
const MS_PER_MINUTE = 60_000;
const EMPTY_LENGTH = 0;
const LAST_OFFSET = 1;

interface BusyRange {
  start: number;
  end: number;
}

function parseBusy(busy: Array<{ start: string; end: string }>): BusyRange[] {
  return busy
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
    .filter((b) => !Number.isNaN(b.start) && !Number.isNaN(b.end))
    .sort((a, b) => a.start - b.start);
}

function mergeBusyRanges(ranges: BusyRange[]): BusyRange[] {
  if (ranges.length === EMPTY_LENGTH) return ranges;
  const [first, ...rest] = ranges;
  if (first === undefined) return [];
  const merged: BusyRange[] = [first];
  for (const r of rest) {
    const { [merged.length - LAST_OFFSET]: last } = merged;
    if (last === undefined) continue;
    if (r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push(r);
    }
  }
  return merged;
}

export interface ComputeSlotsArgs {
  rangeStartIso: string;
  rangeEndIso: string;
  durationMinutes: number;
  busy: Array<{ start: string; end: string }>;
}

function collectFreeRanges(rangeStart: number, rangeEnd: number, merged: BusyRange[]): BusyRange[] {
  const free: BusyRange[] = [];
  let cursor = rangeStart;
  for (const b of merged) {
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, rangeEnd) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= rangeEnd) break;
  }
  if (cursor < rangeEnd) free.push({ start: cursor, end: rangeEnd });
  return free;
}

export function computeAvailableSlots(args: ComputeSlotsArgs): AvailableSlot[] {
  const rangeStart = new Date(args.rangeStartIso).getTime();
  const rangeEnd = new Date(args.rangeEndIso).getTime();
  const durationMs = args.durationMinutes * MS_PER_MINUTE;
  if (Number.isNaN(rangeStart) || Number.isNaN(rangeEnd) || rangeEnd - rangeStart < durationMs) {
    return [];
  }
  const merged = mergeBusyRanges(parseBusy(args.busy));
  const free = collectFreeRanges(rangeStart, rangeEnd, merged);
  const slots: AvailableSlot[] = [];
  for (const f of free) {
    if (f.end - f.start < durationMs) continue;
    slots.push({
      startIso: new Date(f.start).toISOString(),
      endIso: new Date(f.start + durationMs).toISOString(),
    });
    if (slots.length >= MAX_SLOTS) break;
  }
  return slots;
}
