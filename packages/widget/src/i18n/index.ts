import en from './en.json';
import es from './es.json';

export type Locale = 'en' | 'es';
export type TKey = keyof typeof en;

const BUNDLES: Record<Locale, Record<TKey, string>> = {
  en: en as Record<TKey, string>,
  es: es as Record<TKey, string>,
};

export function pickLocale(queryParam: string | null, navigatorLang: string | undefined): Locale {
  const explicit = queryParam?.slice(0, 2).toLowerCase();
  if (explicit === 'es' || explicit === 'en') return explicit;
  const nav = navigatorLang?.slice(0, 2).toLowerCase();
  if (nav === 'es') return 'es';
  return 'en';
}

export function createT(locale: Locale) {
  const bundle = BUNDLES[locale];
  return (key: TKey): string => bundle[key] ?? key;
}
