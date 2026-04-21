import type { Request, Response } from 'express';
import { describe, expect, it, jest } from '@jest/globals';

type RpcResult = { data: string[]; error: null };

jest.unstable_mockModule('../../../db/client.js', () => ({
  serviceSupabase: jest.fn(() => ({
    rpc: jest.fn<() => Promise<RpcResult>>().mockResolvedValue({ data: ['email', 'google'], error: null }),
  })),
}));
jest.unstable_mockModule('../../../lib/auditLog.js', () => ({ auditLog: jest.fn() }));

const { lookupEmailRouter } = await import('./lookupEmail.js');

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: jest.Mock;
  json: jest.Mock;
};

function buildRes(): MockResponse {
  const mockRes: MockResponse = {
    statusCode: HTTP_OK,
    body: null,
    status: jest.fn(),
    json: jest.fn(),
  };
  mockRes.status.mockImplementation((...args: unknown[]) => {
    mockRes.statusCode = args[0] as number;
    return mockRes;
  });
  mockRes.json.mockImplementation((...args: unknown[]) => {
    mockRes.body = args[0];
    return mockRes;
  });
  return mockRes;
}

function buildReq(body: unknown, ip = '127.0.0.1'): Request {
  return { body, ip, get: jest.fn().mockReturnValue(undefined) } as unknown as Request;
}

function getRoute(router: ReturnType<typeof lookupEmailRouter>) {
  type RouteLayer = {
    route?: {
      path: string;
      stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
    };
  };
  const layers = (router as unknown as { stack: RouteLayer[] }).stack;
  const layer = layers.find((l) => l.route?.path === '/lookup-email');
  const handler = layer?.route?.stack[0]?.handle;
  if (handler === undefined) throw new Error('handler not found');
  return handler;
}

describe('POST /auth/public/lookup-email', () => {
  it('returns providers for existing email', async () => {
    const router = lookupEmailRouter();
    const handler = getRoute(router);
    const req = buildReq({ email: 'a@b.com' });
    const mockRes = buildRes();
    await handler(req, mockRes as unknown as Response);
    expect(mockRes.statusCode).toBe(HTTP_OK);
    expect(mockRes.body).toEqual({ exists: true, providers: ['email', 'google'] });
  });

  it('rejects malformed email with 400', async () => {
    const router = lookupEmailRouter();
    const handler = getRoute(router);
    const req = buildReq({ email: 'not-an-email' });
    const mockRes = buildRes();
    await handler(req, mockRes as unknown as Response);
    expect(mockRes.statusCode).toBe(HTTP_BAD_REQUEST);
  });
});
