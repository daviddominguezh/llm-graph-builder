import type { Country } from 'react-phone-number-input';

export const ALLOWED_COUNTRIES: readonly Country[] = ['US', 'CA', 'GB', 'CO', 'AR', 'CL', 'MX', 'BR'];
export const DEFAULT_COUNTRY: Country = 'US';

const ALLOWED_SET: ReadonlySet<string> = new Set<string>(ALLOWED_COUNTRIES);

const TIMEZONE_TO_COUNTRY: Readonly<Record<string, Country>> = {
  // United States
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Phoenix': 'US',
  'America/Anchorage': 'US',
  'America/Boise': 'US',
  'America/Detroit': 'US',
  'America/Indiana/Indianapolis': 'US',
  'America/Kentucky/Louisville': 'US',
  'Pacific/Honolulu': 'US',
  // Canada
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA',
  'America/Halifax': 'CA',
  'America/St_Johns': 'CA',
  'America/Regina': 'CA',
  'America/Moncton': 'CA',
  // United Kingdom
  'Europe/London': 'GB',
  // Colombia
  'America/Bogota': 'CO',
  // Argentina
  'America/Argentina/Buenos_Aires': 'AR',
  'America/Argentina/Catamarca': 'AR',
  'America/Argentina/Cordoba': 'AR',
  'America/Argentina/Jujuy': 'AR',
  'America/Argentina/La_Rioja': 'AR',
  'America/Argentina/Mendoza': 'AR',
  'America/Argentina/Rio_Gallegos': 'AR',
  'America/Argentina/Salta': 'AR',
  'America/Argentina/San_Juan': 'AR',
  'America/Argentina/San_Luis': 'AR',
  'America/Argentina/Tucuman': 'AR',
  'America/Argentina/Ushuaia': 'AR',
  'America/Buenos_Aires': 'AR',
  // Chile
  'America/Santiago': 'CL',
  'America/Punta_Arenas': 'CL',
  'Pacific/Easter': 'CL',
  // Mexico
  'America/Mexico_City': 'MX',
  'America/Cancun': 'MX',
  'America/Merida': 'MX',
  'America/Monterrey': 'MX',
  'America/Matamoros': 'MX',
  'America/Chihuahua': 'MX',
  'America/Ciudad_Juarez': 'MX',
  'America/Ojinaga': 'MX',
  'America/Mazatlan': 'MX',
  'America/Bahia_Banderas': 'MX',
  'America/Hermosillo': 'MX',
  'America/Tijuana': 'MX',
  // Brazil
  'America/Sao_Paulo': 'BR',
  'America/Fortaleza': 'BR',
  'America/Recife': 'BR',
  'America/Manaus': 'BR',
  'America/Rio_Branco': 'BR',
  'America/Bahia': 'BR',
  'America/Belem': 'BR',
  'America/Boa_Vista': 'BR',
  'America/Campo_Grande': 'BR',
  'America/Cuiaba': 'BR',
  'America/Eirunepe': 'BR',
  'America/Maceio': 'BR',
  'America/Noronha': 'BR',
  'America/Porto_Velho': 'BR',
  'America/Santarem': 'BR',
};

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
    return TIMEZONE_TO_COUNTRY[tz] ?? null;
  } catch {
    return null;
  }
}

export function detectCountry(): Country {
  if (typeof navigator === 'undefined') return DEFAULT_COUNTRY;
  return fromLocales() ?? fromTimezone() ?? DEFAULT_COUNTRY;
}
