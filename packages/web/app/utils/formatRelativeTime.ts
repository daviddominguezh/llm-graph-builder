const ONE_SECOND = 1;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_WEEK = 604_800;
const SECONDS_PER_MONTH = 2_592_000;
const SECONDS_PER_YEAR = 31_536_000;

interface TimeUnit {
  threshold: number;
  unit: Intl.RelativeTimeFormatUnit;
  divisor: number;
}

const TIME_UNITS: TimeUnit[] = [
  { threshold: SECONDS_PER_MINUTE, unit: 'second', divisor: ONE_SECOND },
  { threshold: SECONDS_PER_HOUR, unit: 'minute', divisor: SECONDS_PER_MINUTE },
  { threshold: SECONDS_PER_DAY, unit: 'hour', divisor: SECONDS_PER_HOUR },
  { threshold: SECONDS_PER_WEEK, unit: 'day', divisor: SECONDS_PER_DAY },
  { threshold: SECONDS_PER_MONTH, unit: 'week', divisor: SECONDS_PER_WEEK },
  { threshold: SECONDS_PER_YEAR, unit: 'month', divisor: SECONDS_PER_MONTH },
];

function findUnit(diffSeconds: number): { unit: Intl.RelativeTimeFormatUnit; value: number } {
  const abs = Math.abs(diffSeconds);
  for (const { threshold, unit, divisor } of TIME_UNITS) {
    if (abs < threshold) {
      return { unit, value: -Math.floor(diffSeconds / divisor) };
    }
  }
  return { unit: 'year', value: -Math.floor(diffSeconds / SECONDS_PER_YEAR) };
}

const MS_PER_SECOND = 1_000;

export function formatRelativeTime(dateString: string, locale = 'en'): string {
  const diffSeconds = (Date.now() - new Date(dateString).getTime()) / MS_PER_SECOND;
  const { unit, value } = findUnit(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return formatter.format(value, unit);
}
