const MS_PER_SECOND = 1000;
const SECONDS_JUST_NOW_THRESHOLD = 15;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;

export type RelativeTime =
  | 'just-now'
  | `seconds:${number}`
  | `minutes:${number}`
  | `hours:${number}`
  | `days:${number}`;

export function formatRelativeTime(now: Date, past: Date): RelativeTime {
  const delta = Math.floor((now.getTime() - past.getTime()) / MS_PER_SECOND);
  if (delta < SECONDS_JUST_NOW_THRESHOLD) return 'just-now';
  if (delta < SECONDS_PER_MINUTE) return `seconds:${delta}`;
  if (delta < SECONDS_PER_HOUR) return `minutes:${Math.floor(delta / SECONDS_PER_MINUTE)}`;
  if (delta < SECONDS_PER_DAY) return `hours:${Math.floor(delta / SECONDS_PER_HOUR)}`;
  return `days:${Math.floor(delta / SECONDS_PER_DAY)}`;
}
