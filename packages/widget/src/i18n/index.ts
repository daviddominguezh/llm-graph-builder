import en from './en.json';
import es from './es.json';

export type Locale = 'en' | 'es';
export type TKey = keyof typeof en;

const LOCALE_PREFIX_START = 0;
const LOCALE_PREFIX_END = 2;

const BUNDLES: Record<Locale, Record<TKey, string>> = {
  en: en as Record<TKey, string>,
  es: es as Record<TKey, string>,
};

export function pickLocale(queryParam: string | null, navigatorLang: string | undefined): Locale {
  const explicit = queryParam?.slice(LOCALE_PREFIX_START, LOCALE_PREFIX_END).toLowerCase();
  if (explicit === 'es' || explicit === 'en') return explicit;
  const nav = navigatorLang?.slice(LOCALE_PREFIX_START, LOCALE_PREFIX_END).toLowerCase();
  if (nav === 'es') return 'es';
  return 'en';
}

function interpolate(template: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((acc, [name, value]) => acc.replaceAll(`{${name}}`, value), template);
}

export type TFn = (key: TKey, params?: Record<string, string>) => string;

function lookup(locale: Locale, key: TKey): string {
  return BUNDLES[locale][key];
}

export function createT(locale: Locale): TFn {
  return (key, params) => {
    const template = lookup(locale, key);
    return params === undefined ? template : interpolate(template, params);
  };
}
