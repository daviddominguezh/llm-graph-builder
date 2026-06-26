import { describe, expect, it } from '@jest/globals';

import { validatePhone } from './phoneValidation.js';

describe('validatePhone — accepts supported mobiles', () => {
  it('accepts a valid US mobile', () => {
    expect(validatePhone('+14155550199')).toEqual({ ok: true, e164: '+14155550199' });
  });
  it('accepts a valid UK mobile', () => {
    expect(validatePhone('+447911000001')).toEqual({ ok: true, e164: '+447911000001' });
  });
  it('accepts a valid Colombia mobile', () => {
    expect(validatePhone('+573001234567')).toEqual({ ok: true, e164: '+573001234567' });
  });
  it('accepts a valid Argentina mobile', () => {
    expect(validatePhone('+5491123456789')).toEqual({ ok: true, e164: '+5491123456789' });
  });
  it('accepts a valid Chile mobile', () => {
    expect(validatePhone('+56912345678')).toEqual({ ok: true, e164: '+56912345678' });
  });
  it('accepts a valid Mexico mobile', () => {
    expect(validatePhone('+525512345678')).toEqual({ ok: true, e164: '+525512345678' });
  });
  it('accepts a valid Brazil mobile', () => {
    expect(validatePhone('+5511912345678')).toEqual({ ok: true, e164: '+5511912345678' });
  });
  it('accepts a valid France mobile', () => {
    expect(validatePhone('+33612345678')).toEqual({ ok: true, e164: '+33612345678' });
  });
  it('accepts a valid Spain mobile', () => {
    expect(validatePhone('+34612345678')).toEqual({ ok: true, e164: '+34612345678' });
  });
});

describe('validatePhone — rejects disallowed numbers', () => {
  it('rejects out-of-region country (India)', () => {
    expect(validatePhone('+919812345678')).toEqual({ ok: false, error: 'country_not_supported' });
  });
  it('rejects excluded sanctioned country (Russia)', () => {
    expect(validatePhone('+79161234567')).toEqual({ ok: false, error: 'country_not_supported' });
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
