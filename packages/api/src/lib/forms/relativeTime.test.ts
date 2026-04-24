import { describe, expect, it } from '@jest/globals';

import { formatRelativeTime } from './relativeTime.js';

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;
const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;

const JUST_NOW_DELAY_SECONDS = 10;
const SECONDS_DELAY = 45;
const MINUTES_DELAY = 5;
const HOURS_DELAY = 3;
const DAYS_DELAY = 2;

describe('formatRelativeTime', () => {
  it('just now for <15s', () => {
    expect(
      formatRelativeTime(new Date(), new Date(Date.now() - JUST_NOW_DELAY_SECONDS * MS_PER_SECOND))
    ).toBe('just-now');
  });
  it('seconds', () => {
    expect(formatRelativeTime(new Date(), new Date(Date.now() - SECONDS_DELAY * MS_PER_SECOND))).toBe(
      `seconds:${SECONDS_DELAY}`
    );
  });
  it('minutes', () => {
    expect(formatRelativeTime(new Date(), new Date(Date.now() - MINUTES_DELAY * MS_PER_MINUTE))).toBe(
      `minutes:${MINUTES_DELAY}`
    );
  });
  it('hours', () => {
    expect(formatRelativeTime(new Date(), new Date(Date.now() - HOURS_DELAY * MS_PER_HOUR))).toBe(
      `hours:${HOURS_DELAY}`
    );
  });
  it('days', () => {
    expect(formatRelativeTime(new Date(), new Date(Date.now() - DAYS_DELAY * MS_PER_DAY))).toBe(
      `days:${DAYS_DELAY}`
    );
  });
});
