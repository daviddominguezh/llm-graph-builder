import type { ValidationRule } from '../../types/forms.js';

const RADIX = 10;
const HOUR_MIN = 0;
const HOUR_MAX = 24;
const MINUTE_MAX = 60;
const MIN_WORD_LENGTH = 2;
const MIN_WORDS = 2;

export type ValidationOutcome = { ok: true } | { ok: false; reason: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/v;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/v;
const HOUR_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/v;

export function runValidation(value: unknown, rule: ValidationRule): ValidationOutcome {
  switch (rule.kind) {
    case 'email': {
      return checkString(value, (s) => EMAIL_RE.test(s), 'Expected a valid email');
    }
    case 'twoWordName': {
      return checkString(value, isTwoWordName, 'Expected two words, each ≥2 chars');
    }
    case 'pastDate': {
      return checkDate(value, 'past');
    }
    case 'futureDate': {
      return checkDate(value, 'future');
    }
    case 'pastHour': {
      return checkHour(value, 'past');
    }
    case 'futureHour': {
      return checkHour(value, 'future');
    }
    case 'length': {
      return checkLength(value, rule);
    }
  }
}

function checkString(v: unknown, predicate: (s: string) => boolean, reason: string): ValidationOutcome {
  if (typeof v !== 'string' || !predicate(v)) {
    return { ok: false, reason };
  }
  return { ok: true };
}

function isTwoWordName(s: string): boolean {
  const parts = s.trim().split(/\s+/v);
  return parts.length >= MIN_WORDS && parts.every((p) => p.length >= MIN_WORD_LENGTH);
}

function checkDate(v: unknown, kind: 'past' | 'future'): ValidationOutcome {
  if (typeof v !== 'string' || !DATE_RE.test(v)) {
    return { ok: false, reason: 'Expected ISO date YYYY-MM-DD' };
  }
  const d = new Date(`${v}T00:00:00Z`).getTime();
  const now = Date.now();

  const isPastInvalid = kind === 'past' && d >= now;
  if (isPastInvalid) {
    return { ok: false, reason: 'Date must be in the past' };
  }

  const isFutureInvalid = kind === 'future' && d <= now;
  if (isFutureInvalid) {
    return { ok: false, reason: 'Date must be in the future' };
  }

  return { ok: true };
}

function parseHourTime(s: string): { hour: number; minute: number } | null {
  const parts = s.split(':').map((p) => parseInt(p, RADIX));
  if (parts.length !== MIN_WORDS || parts.some((p) => Number.isNaN(p))) {
    return null;
  }
  const [hour, minute] = parts;
  if (hour < HOUR_MIN || hour >= HOUR_MAX || minute < HOUR_MIN || minute >= MINUTE_MAX) {
    return null;
  }
  return { hour, minute };
}

function checkHour(v: unknown, kind: 'past' | 'future'): ValidationOutcome {
  if (typeof v !== 'string' || !HOUR_RE.test(v)) {
    return { ok: false, reason: 'Expected HH:mm' };
  }
  const parsed = parseHourTime(v);
  if (parsed === null) {
    return { ok: false, reason: 'Expected HH:mm' };
  }

  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(parsed.hour, parsed.minute, HOUR_MIN, HOUR_MIN);

  const isPastInvalid = kind === 'past' && candidate.getTime() >= now.getTime();
  if (isPastInvalid) {
    return { ok: false, reason: 'Hour must be in the past' };
  }

  const isFutureInvalid = kind === 'future' && candidate.getTime() <= now.getTime();
  if (isFutureInvalid) {
    return { ok: false, reason: 'Hour must be in the future' };
  }

  return { ok: true };
}

function checkLength(v: unknown, rule: { min?: number; max?: number; exact?: number }): ValidationOutcome {
  const size = typeof v === 'string' ? v.length : typeof v === 'number' ? v : null;
  if (size === null) {
    return { ok: false, reason: 'Length/range applies to strings and numbers only' };
  }

  const exactMismatch = rule.exact !== undefined && size !== rule.exact;
  if (exactMismatch) {
    return { ok: false, reason: `Expected exactly ${String(rule.exact)}` };
  }

  const tooSmall = rule.min !== undefined && size < rule.min;
  if (tooSmall) {
    return { ok: false, reason: `Expected at least ${String(rule.min)}` };
  }

  const tooLarge = rule.max !== undefined && size > rule.max;
  if (tooLarge) {
    return { ok: false, reason: `Expected at most ${String(rule.max)}` };
  }

  return { ok: true };
}
