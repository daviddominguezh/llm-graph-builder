import { describe, it, expect } from 'vitest';
import { createSessionsBackend } from './sessionsBackend.js';

describe('sessionsBackend', () => {
  it('returns indexeddb backend when available and writable', async () => {
    const b = await createSessionsBackend();
    expect(b.kind).toBe('indexeddb');
  });
  it('returns in-memory backend when IndexedDB throws', async () => {
    const origIndexedDB = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
    });
    const b = await createSessionsBackend();
    expect(b.kind).toBe('memory');
    Object.defineProperty(globalThis, 'indexedDB', {
      value: origIndexedDB,
      configurable: true,
    });
  });
});
