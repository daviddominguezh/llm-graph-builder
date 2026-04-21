import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type InsertRow = Record<string, unknown>;
const mockInsert = jest.fn<(row: InsertRow) => Promise<{ error: null }>>().mockResolvedValue({ error: null });
const mockFrom = jest.fn(() => ({ insert: mockInsert }));
const mockServiceSupabase = jest.fn(() => ({ from: mockFrom }));

jest.unstable_mockModule('../db/client.js', () => ({
  serviceSupabase: mockServiceSupabase,
}));

const { auditLog } = await import('./auditLog.js');

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockResolvedValue({ error: null });
  mockFrom.mockReturnValue({ insert: mockInsert });
  mockServiceSupabase.mockReturnValue({ from: mockFrom });
});

describe('auditLog', () => {
  it('writes a row with the given fields', async () => {
    await auditLog({
      event: 'phone_verified',
      userId: '11111111-1111-1111-1111-111111111111',
      phone: '+14155550199',
      ip: '1.2.3.4',
      userAgent: 'test',
    });
    const FIRST_CALL = 0;
    const FIRST_ARG = 0;
    const insertArg = mockInsert.mock.calls[FIRST_CALL]?.[FIRST_ARG];
    expect(insertArg).toMatchObject({
      event: 'phone_verified',
      user_id: '11111111-1111-1111-1111-111111111111',
      phone: '+14155550199',
      ip_truncated: '1.2.3.0',
    });
  });
});
