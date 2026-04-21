import { describe, expect, it } from 'vitest';

import en from './en.json';
import es from './es.json';
import { createT, pickLocale } from './index.js';

describe('i18n', () => {
  it('en and es have identical keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
  it('pickLocale respects query-param then navigator', () => {
    expect(pickLocale('es', 'en-US')).toBe('es');
    expect(pickLocale(null, 'es-AR')).toBe('es');
    expect(pickLocale(null, 'fr-FR')).toBe('en');
    expect(pickLocale(null, undefined)).toBe('en');
  });
  it('createT returns the value for a known key', () => {
    const t = createT('en');
    expect(t('title')).toBe('Copilot');
  });
});
