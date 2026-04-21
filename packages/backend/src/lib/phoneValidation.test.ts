import { describe, expect, it } from '@jest/globals';

import { validatePhone } from './phoneValidation.js';

describe('validatePhone', () => {
  it('accepts a valid US mobile', () => {
    expect(validatePhone('+14155550199')).toEqual({ ok: true, e164: '+14155550199' });
  });
  it('accepts a valid UK mobile', () => {
    expect(validatePhone('+447911000001')).toEqual({ ok: true, e164: '+447911000001' });
  });
  it('rejects unsupported country', () => {
    expect(validatePhone('+33123456789')).toEqual({ ok: false, error: 'country_not_supported' });
  });
  it('rejects premium NANP 900', () => {
    expect(validatePhone('+19005551234')).toEqual({ ok: false, error: 'premium_number' });
  });
  it('rejects premium UK 09', () => {
    expect(validatePhone('+4409001234567')).toMatchObject({ ok: false });
  });
  it('rejects malformed', () => {
    expect(validatePhone('not-a-number')).toEqual({ ok: false, error: 'invalid_format' });
  });
});
