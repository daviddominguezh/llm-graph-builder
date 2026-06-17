import { ToolError } from '@daviddh/llm-graph-runner';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import {
  AUTH,
  EXECUTION_AUTH_MOCK,
  HTTP_BAD,
  HTTP_INTERNAL,
  HTTP_OK,
  LIMIT,
  OFFSET,
  STORE_ID,
  TENANT_ID,
  TWO,
  ZERO,
  asBody,
  buildApp,
  makeMockKv,
  makeMockRag,
  resetKvMocks,
} from './testHarness.js';

interface ListKeysBody {
  tenantId: string;
  storeId: string;
  offset: number;
  limit: number;
}

interface SubstringSearchBody {
  tenantId: string;
  storeId: string;
  mode: 'substring';
  on: 'both';
  query: string;
  offset: number;
  limit: number;
}

interface RegexSearchBody {
  tenantId: string;
  storeId: string;
  mode: 'regex';
  on: 'keys';
  pattern: string;
  offset: number;
  limit: number;
}

process.env.INTERNAL_SERVICE_KEY = 'test-key';

const mockKvSvc = makeMockKv();
const mockRagSvc = makeMockRag();
const mockMakeKv = jest.fn(() => mockKvSvc);
const mockMakeRag = jest.fn(() => mockRagSvc);
const mockCreateClient = jest.fn(() => ({}) as unknown);

jest.unstable_mockModule('../../../services/kvStoreService.js', () => ({
  makeKvStoreService: mockMakeKv,
}));
jest.unstable_mockModule('../../../services/ragStoreService.js', () => ({
  makeRagStoreService: mockMakeRag,
}));
jest.unstable_mockModule('../../../db/queries/executionAuthQueries.js', () => ({
  createServiceClient: mockCreateClient,
  ...EXECUTION_AUTH_MOCK,
}));

const { internalRouter } = await import('../internalRouter.js');
const app = buildApp(internalRouter, express);

beforeEach(() => {
  resetKvMocks(mockKvSvc);
});

const KV_LIST_KEYS_PATH = '/internal/tools/kv-store/list-keys';
const KV_SEARCH_PATH = '/internal/tools/kv-store/search';
const KV_UPDATE_PATH = '/internal/tools/kv-store/update-value';
const KV_GET_VALUES_PATH = '/internal/tools/kv-store/get-values';

function listKeysBody(): ListKeysBody {
  return { tenantId: TENANT_ID, storeId: STORE_ID, offset: OFFSET, limit: LIMIT };
}

describe('POST /internal/tools/kv-store/list-keys', () => {
  it('returns ok+result on success', async () => {
    mockKvSvc.listKeys.mockResolvedValue({ items: ['a', 'b'], total: TWO, offset: OFFSET, limit: LIMIT });
    const res = await request(app).post(KV_LIST_KEYS_PATH).set(AUTH).send(listKeysBody());
    expect(res.status).toBe(HTTP_OK);
    expect(asBody(res.body)).toEqual({
      ok: true,
      result: { items: ['a', 'b'], total: TWO, offset: OFFSET, limit: LIMIT },
    });
    expect(mockKvSvc.listKeys).toHaveBeenCalledWith(TENANT_ID, OFFSET, LIMIT);
  });

  it('rejects invalid body via Zod', async () => {
    const res = await request(app).post(KV_LIST_KEYS_PATH).set(AUTH).send({ tenantId: TENANT_ID });
    expect(res.status).toBe(HTTP_BAD);
    expect(asBody(res.body).ok).toBe(false);
    expect(asBody(res.body).error?.code).toBe('invalid_request');
  });

  it('maps ToolError to ok:false', async () => {
    mockKvSvc.listKeys.mockRejectedValue(new ToolError('no_store_bound', 'no store'));
    const res = await request(app).post(KV_LIST_KEYS_PATH).set(AUTH).send(listKeysBody());
    expect(res.status).toBe(HTTP_OK);
    expect(asBody(res.body)).toEqual({
      ok: false,
      error: { code: 'no_store_bound', message: 'no store' },
    });
  });

  it('returns 500 on unexpected error', async () => {
    mockKvSvc.listKeys.mockRejectedValue(new Error('boom'));
    const res = await request(app).post(KV_LIST_KEYS_PATH).set(AUTH).send(listKeysBody());
    expect(res.status).toBe(HTTP_INTERNAL);
    expect(asBody(res.body).error?.code).toBe('internal_error');
  });
});

describe('POST /internal/tools/kv-store/get-values', () => {
  it('forwards keys to svc.getValues', async () => {
    mockKvSvc.getValues.mockResolvedValue({ a: 'x', b: null });
    const res = await request(app)
      .post(KV_GET_VALUES_PATH)
      .set(AUTH)
      .send({ tenantId: TENANT_ID, storeId: STORE_ID, keys: ['a', 'b'] });
    expect(res.status).toBe(HTTP_OK);
    expect(asBody(res.body)).toEqual({ ok: true, result: { a: 'x', b: null } });
    expect(mockKvSvc.getValues).toHaveBeenCalledWith(TENANT_ID, ['a', 'b']);
  });
});

function substringSearchBody(): SubstringSearchBody {
  return {
    tenantId: TENANT_ID,
    storeId: STORE_ID,
    mode: 'substring',
    on: 'both',
    query: 'a',
    offset: OFFSET,
    limit: LIMIT,
  };
}

function regexSearchBody(): RegexSearchBody {
  return {
    tenantId: TENANT_ID,
    storeId: STORE_ID,
    mode: 'regex',
    on: 'keys',
    pattern: 'foo',
    offset: OFFSET,
    limit: LIMIT,
  };
}

describe('POST /internal/tools/kv-store/search', () => {
  it('dispatches to searchSubstring when mode=substring', async () => {
    mockKvSvc.searchSubstring.mockResolvedValue({ items: [], total: ZERO, offset: OFFSET, limit: LIMIT });
    const res = await request(app).post(KV_SEARCH_PATH).set(AUTH).send(substringSearchBody());
    expect(res.status).toBe(HTTP_OK);
    expect(mockKvSvc.searchSubstring).toHaveBeenCalled();
    expect(mockKvSvc.searchRegex).not.toHaveBeenCalled();
  });

  it('dispatches to searchRegex when mode=regex', async () => {
    mockKvSvc.searchRegex.mockResolvedValue({ items: [], total: ZERO, offset: OFFSET, limit: LIMIT });
    const res = await request(app).post(KV_SEARCH_PATH).set(AUTH).send(regexSearchBody());
    expect(res.status).toBe(HTTP_OK);
    expect(mockKvSvc.searchRegex).toHaveBeenCalled();
    expect(mockKvSvc.searchSubstring).not.toHaveBeenCalled();
  });

  it('maps invalid_pattern ToolError', async () => {
    mockKvSvc.searchRegex.mockRejectedValue(new ToolError('invalid_pattern', 'bad'));
    const res = await request(app)
      .post(KV_SEARCH_PATH)
      .set(AUTH)
      .send({ ...regexSearchBody(), pattern: '(' });
    expect(res.status).toBe(HTTP_OK);
    expect(asBody(res.body).error?.code).toBe('invalid_pattern');
  });
});

describe('POST /internal/tools/kv-store/update-value', () => {
  it('returns success: true on update', async () => {
    mockKvSvc.updateValue.mockResolvedValue({ success: true });
    const res = await request(app)
      .post(KV_UPDATE_PATH)
      .set(AUTH)
      .send({ tenantId: TENANT_ID, storeId: STORE_ID, key: 'k', value: 'v' });
    expect(res.status).toBe(HTTP_OK);
    expect(asBody(res.body)).toEqual({ ok: true, result: { success: true } });
  });

  it('maps protected_key ToolError', async () => {
    mockKvSvc.updateValue.mockRejectedValue(new ToolError('protected_key', 'reserved'));
    const res = await request(app)
      .post(KV_UPDATE_PATH)
      .set(AUTH)
      .send({ tenantId: TENANT_ID, storeId: STORE_ID, key: '_sys.foo', value: 'v' });
    expect(asBody(res.body).error?.code).toBe('protected_key');
  });
});
