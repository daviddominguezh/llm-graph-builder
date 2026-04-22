import { parsePhoneNumberFromString } from 'libphonenumber-js';

const ALLOWED_COUNTRIES = new Set(['US', 'CA', 'GB', 'CO', 'AR', 'CL', 'MX', 'BR']);

const PREMIUM_PATTERNS: RegExp[] = [/^\+1900\d{7}$/v, /^\+1976\d{7}$/v, /^\+44(?:9|87|871|872|873|90)\d+$/v];

export type PhoneValidation =
  | { ok: true; e164: string }
  | { ok: false; error: 'invalid_format' | 'country_not_supported' | 'premium_number' };

export function validatePhone(raw: string): PhoneValidation {
  const parsed = parsePhoneNumberFromString(raw);
  if (parsed?.isValid() !== true) return { ok: false, error: 'invalid_format' };
  if (parsed.country === undefined || !ALLOWED_COUNTRIES.has(parsed.country)) {
    return { ok: false, error: 'country_not_supported' };
  }
  const { number: e164 } = parsed;
  if (PREMIUM_PATTERNS.some((re) => re.test(e164))) return { ok: false, error: 'premium_number' };
  return { ok: true, e164 };
}
