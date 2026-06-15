import type { Country } from 'react-phone-number-input';

// Phone-auth (SMS OTP) country allowlist.
//
// Coverage: all of Europe + all of the Americas (North, Central, South, Caribbean),
// EXCLUDING countries commonly blocked from SMS OTP for sanctions / SMS-pumping fraud:
// Russia (RU), Belarus (BY), Cuba (CU), Venezuela (VE), Nicaragua (NI).
//
// Keep in sync with packages/backend/src/lib/allowedCountries.ts.

// European sovereign states (minus RU, BY).
export const EUROPE: readonly Country[] = [
  'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR',
  'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK',
  'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK', 'SM', 'TR', 'UA', 'VA',
];

// Americas — North, Central, South America + Caribbean sovereign states (minus CU, VE, NI).
export const AMERICAS: readonly Country[] = [
  'AG', 'AR', 'BB', 'BO', 'BR', 'BS', 'BZ', 'CA', 'CL', 'CO', 'CR', 'DM', 'DO', 'EC', 'GD',
  'GT', 'GY', 'HN', 'HT', 'JM', 'KN', 'LC', 'MX', 'PA', 'PE', 'PY', 'SR', 'SV', 'TT', 'US',
  'UY', 'VC',
];

export const ALLOWED_COUNTRIES: readonly Country[] = [...EUROPE, ...AMERICAS];
export const DEFAULT_COUNTRY: Country = 'US';
