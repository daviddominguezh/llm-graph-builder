import { type KvKeysetCursor, decodeCursor, encodeCursor } from '../pagination.js';

describe('opaque cursor codec', () => {
  it('round-trips a payload', () => {
    const payload: KvKeysetCursor = { lastKey: 'user:42' };
    const token = encodeCursor(payload);
    expect(typeof token).toBe('string');
    expect(token).not.toContain('user:42'); // opaque, not plaintext
    expect(decodeCursor<KvKeysetCursor>(token)).toEqual(payload);
  });

  it('throws on a malformed cursor', () => {
    expect(() => decodeCursor('!!!not-base64!!!')).toThrow('invalid cursor');
  });
});
