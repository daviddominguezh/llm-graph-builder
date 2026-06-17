import { jest } from '@jest/globals';
import type express from 'express';

export const STORE_ID = 'kv-1';
export const TENANT_ID = 't1';
export const OFFSET = 0;
export const LIMIT = 10;
export const HTTP_OK = 200;
export const HTTP_BAD = 400;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_INTERNAL = 500;
export const TWO = 2;
export const ZERO = 0;
export const HALF = 0.5;
export const ONE = 1;

export const AUTH = { authorization: 'Bearer test-key' };

export type AnyFn = (...args: unknown[]) => Promise<unknown>;

interface BodyShape {
  ok: boolean;
  error?: { code: string; message: string };
  result?: unknown;
}

function isBodyShape(value: unknown): value is BodyShape {
  if (typeof value !== 'object' || value === null) return false;
  return 'ok' in value;
}

export function asBody(value: unknown): BodyShape {
  if (isBodyShape(value)) return value;
  return { ok: false };
}

export interface MockKvSvc {
  storeId: string;
  listKeys: jest.Mock<AnyFn>;
  getValues: jest.Mock<AnyFn>;
  searchSubstring: jest.Mock<AnyFn>;
  searchRegex: jest.Mock<AnyFn>;
  updateValue: jest.Mock<AnyFn>;
}

export interface MockRagSvc {
  storeId: string;
  searchBm25: jest.Mock<AnyFn>;
  searchSemantic: jest.Mock<AnyFn>;
  searchHybrid: jest.Mock<AnyFn>;
  searchRegex: jest.Mock<AnyFn>;
}

export function makeMockKv(): MockKvSvc {
  return {
    storeId: STORE_ID,
    listKeys: jest.fn<AnyFn>(),
    getValues: jest.fn<AnyFn>(),
    searchSubstring: jest.fn<AnyFn>(),
    searchRegex: jest.fn<AnyFn>(),
    updateValue: jest.fn<AnyFn>(),
  };
}

export function makeMockRag(): MockRagSvc {
  return {
    storeId: STORE_ID,
    searchBm25: jest.fn<AnyFn>(),
    searchSemantic: jest.fn<AnyFn>(),
    searchHybrid: jest.fn<AnyFn>(),
    searchRegex: jest.fn<AnyFn>(),
  };
}

export function resetKvMocks(m: MockKvSvc): void {
  m.listKeys.mockReset();
  m.getValues.mockReset();
  m.searchSubstring.mockReset();
  m.searchRegex.mockReset();
  m.updateValue.mockReset();
}

export function resetRagMocks(m: MockRagSvc): void {
  m.searchBm25.mockReset();
  m.searchSemantic.mockReset();
  m.searchHybrid.mockReset();
  m.searchRegex.mockReset();
}

export function buildApp(internalRouter: express.Router, expressLib: typeof express): express.Express {
  const app = expressLib();
  app.use(expressLib.json());
  app.use('/internal', internalRouter);
  return app;
}

export const EXECUTION_AUTH_MOCK = {
  validateExecutionKey: jest.fn(),
  validateKeyAgentAccess: jest.fn(),
  getAgentBySlugAndOrg: jest.fn(),
  getPublishedGraphData: jest.fn(),
  getDecryptedApiKeyValue: jest.fn(),
  getDecryptedEnvVariables: jest.fn(),
  updateKeyLastUsed: jest.fn(),
};
