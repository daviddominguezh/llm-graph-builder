import { type ReactNode, createContext, useContext } from 'react';

import { type Locale, type TFn, createT } from '../i18n/index.js';

const I18nContext = createContext<TFn>(() => '');

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={createT(locale)}>{children}</I18nContext.Provider>;
}

export function useT(): TFn {
  return useContext(I18nContext);
}
