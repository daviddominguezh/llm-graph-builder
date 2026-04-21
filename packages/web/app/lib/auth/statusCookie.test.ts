import { describe, it, expect, beforeEach } from '@jest/globals';
import { signStatusCookie, verifyStatusCookie } from './statusCookie.js';

const SECRET = 'a'.repeat(32);

beforeEach(() => {
  process.env['AUTH_STATUS_COOKIE_SECRET'] = SECRET;
  delete process.env['AUTH_STATUS_COOKIE_SECRET_PREVIOUS'];
});

describe('statusCookie', () => {
  const payload = {
    uid: 'u1',
    tokenBinding: 'tb',
    phone_verified: true,
    onboarding_completed: false,
  };

  it('signs and verifies', () => {
    const cookie = signStatusCookie(payload);
    expect(verifyStatusCookie(cookie)).toEqual(payload);
  });

  it('rejects tampered HMAC', () => {
    const cookie = signStatusCookie(payload);
    const dot = cookie.indexOf('.');
    const body = cookie.slice(0, dot);
    const mac = cookie.slice(dot + 1);
    const lastChar = mac.slice(-1) === 'A' ? 'B' : 'A';
    const bad = `${body}.${mac.slice(0, -1)}${lastChar}`;
    expect(verifyStatusCookie(bad)).toBeNull();
  });

  it('rejects malformed', () => {
    expect(verifyStatusCookie('nodot')).toBeNull();
  });

  it('accepts previous secret during rotation', () => {
    const cookie = signStatusCookie(payload);
    process.env['AUTH_STATUS_COOKIE_SECRET_PREVIOUS'] = SECRET;
    process.env['AUTH_STATUS_COOKIE_SECRET'] = 'b'.repeat(32);
    expect(verifyStatusCookie(cookie)).toEqual(payload);
  });
});
