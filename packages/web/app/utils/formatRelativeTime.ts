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
  suffix: string;
  divisor: number;
}

const TIME_UNITS: TimeUnit[] = [
  { threshold: SECONDS_PER_MINUTE, unit: 'second', suffix: 's', divisor: ONE_SECOND },
  { threshold: SECONDS_PER_HOUR, unit: 'minute', suffix: 'm', divisor: SECONDS_PER_MINUTE },
  { threshold: SECONDS_PER_DAY, unit: 'hour', suffix: 'h', divisor: SECONDS_PER_HOUR },
  { threshold: SECONDS_PER_WEEK, unit: 'day', suffix: 'd', divisor: SECONDS_PER_DAY },
  { threshold: SECONDS_PER_MONTH, unit: 'week', suffix: 'w', divisor: SECONDS_PER_WEEK },
  { threshold: SECONDS_PER_YEAR, unit: 'month', suffix: 'mo', divisor: SECONDS_PER_MONTH },
];

interface ResolvedUnit {
  unit: Intl.RelativeTimeFormatUnit;
  suffix: string;
  value: number;
}

function findUnit(diffSeconds: number): ResolvedUnit {
  const abs = Math.abs(diffSeconds);
  for (const { threshold, unit, suffix, divisor } of TIME_UNITS) {
    if (abs < threshold) {
      return { unit, suffix, value: -Math.floor(diffSeconds / divisor) };
    }
  }
  return { unit: 'year', suffix: 'y', value: -Math.floor(diffSeconds / SECONDS_PER_YEAR) };
}

const MS_PER_SECOND = 1_000;

export function formatRelativeTime(
  dateString: string,
  locale = 'en',
  style: 'long' | 'compact' = 'long'
): string {
  const diffSeconds = (Date.now() - new Date(dateString).getTime()) / MS_PER_SECOND;
  const { unit, suffix, value } = findUnit(diffSeconds);

  if (style === 'compact') {
    const abs = Math.abs(value);
    if (abs === 0) return 'now';
    return `${abs}${suffix}`;
  }

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  return formatter.format(value, unit);
}
