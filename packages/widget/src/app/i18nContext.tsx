import { createContext, useContext, type ReactNode } from 'react';
import { type Locale, type TKey, createT } from '../i18n/index.js';

type T = (key: TKey) => string;

const I18nContext = createContext<T>(() => '');

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={createT(locale)}>{children}</I18nContext.Provider>;
}

export function useT(): T {
  return useContext(I18nContext);
}
