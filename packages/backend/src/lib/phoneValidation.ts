import { parsePhoneNumberFromString } from 'libphonenumber-js';

const ALLOWED_COUNTRIES = new Set(['US', 'CA', 'GB']);

const PREMIUM_PATTERNS: RegExp[] = [
  /^\+1900\d{7}$/,
  /^\+1976\d{7}$/,
  /^\+44(?:9|87|871|872|873|90)\d+$/,
];

export type PhoneValidation =
  | { ok: true; e164: string }
  | { ok: false; error: 'invalid_format' | 'country_not_supported' | 'premium_number' };

export function validatePhone(raw: string): PhoneValidation {
  const parsed = parsePhoneNumberFromString(raw);
  if (parsed === undefined || !parsed.isValid()) return { ok: false, error: 'invalid_format' };
  if (parsed.country === undefined || !ALLOWED_COUNTRIES.has(parsed.country)) {
    return { ok: false, error: 'country_not_supported' };
  }
  const e164 = parsed.number;
  if (PREMIUM_PATTERNS.some((re) => re.test(e164))) return { ok: false, error: 'premium_number' };
  return { ok: true, e164 };
}
