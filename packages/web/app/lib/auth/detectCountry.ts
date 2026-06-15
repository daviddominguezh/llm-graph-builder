import { ALLOWED_COUNTRIES, DEFAULT_COUNTRY } from '@/app/lib/auth/allowedCountries';
import { TIMEZONE_TO_COUNTRY } from '@/app/lib/auth/timezoneCountries';
import type { Country } from 'react-phone-number-input';

export { ALLOWED_COUNTRIES, DEFAULT_COUNTRY };

const ALLOWED_SET: ReadonlySet<string> = new Set<string>(ALLOWED_COUNTRIES);

function fromLocales(): Country | null {
  const locales = [navigator.language, ...(navigator.languages ?? [])];
  for (const loc of locales) {
    try {
      const { region } = new Intl.Locale(loc);
      if (region !== undefined && ALLOWED_SET.has(region)) return region as Country;
    } catch {
      // malformed locale tag — skip
    }
  }
  return null;
}

function fromTimezone(): Country | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const country = TIMEZONE_TO_COUNTRY[tz] ?? null;
    return country !== null && ALLOWED_SET.has(country) ? country : null;
  } catch {
    return null;
  }
}

export function detectCountry(): Country {
  if (typeof navigator === 'undefined') return DEFAULT_COUNTRY;
  return fromLocales() ?? fromTimezone() ?? DEFAULT_COUNTRY;
}
