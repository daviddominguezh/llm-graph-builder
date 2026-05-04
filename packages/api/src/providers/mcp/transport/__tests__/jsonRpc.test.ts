import { describe, expect, it } from '@jest/globals';

import {
  JSON_RPC_VERSION,
  buildNotification,
  buildRequest,
  isJsonRpcError,
  isJsonRpcErrorPayload,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcSuccess,
} from '../jsonRpc.js';

const SAMPLE_ID = 7;
const SAMPLE_CODE = -32601;
const FOO_VALUE = 1;
const ANSWER = 42;

describe('jsonRpc builders', () => {
  it('buildRequest produces a valid JSON-RPC request', () => {
    const req = buildRequest(SAMPLE_ID, 'tools/list', { foo: FOO_VALUE });
    expect(req).toEqual({
      jsonrpc: JSON_RPC_VERSION,
      id: SAMPLE_ID,
      method: 'tools/list',
      params: { foo: FOO_VALUE },
    });
  });

  it('buildNotification omits id and matches shape', () => {
    const notif = buildNotification('notifications/initialized');
    expect(notif).toEqual({
      jsonrpc: JSON_RPC_VERSION,
      method: 'notifications/initialized',
      params: undefined,
    });
    expect('id' in notif).toBe(false);
  });
});

describe('jsonRpc response guards', () => {
  it('isJsonRpcResponse accepts success and error responses', () => {
    expect(isJsonRpcResponse({ jsonrpc: JSON_RPC_VERSION, id: FOO_VALUE, result: 'ok' })).toBe(true);
    expect(
      isJsonRpcResponse({
        jsonrpc: JSON_RPC_VERSION,
        id: FOO_VALUE,
        error: { code: SAMPLE_CODE, message: 'no method' },
      })
    ).toBe(true);
  });

  it('isJsonRpcResponse rejects notifications and bad shapes', () => {
    expect(isJsonRpcResponse({ jsonrpc: JSON_RPC_VERSION, method: 'x' })).toBe(false);
    expect(isJsonRpcResponse(null)).toBe(false);
    expect(isJsonRpcResponse('string')).toBe(false);
    expect(isJsonRpcResponse({ jsonrpc: '1.0', id: FOO_VALUE, result: FOO_VALUE })).toBe(false);
  });

  it('isJsonRpcSuccess and isJsonRpcError discriminate response variants', () => {
    const ok = { jsonrpc: JSON_RPC_VERSION, id: FOO_VALUE, result: ANSWER } as const;
    const err = {
      jsonrpc: JSON_RPC_VERSION,
      id: FOO_VALUE,
      error: { code: SAMPLE_CODE, message: 'x' },
    } as const;
    expect(isJsonRpcSuccess(ok)).toBe(true);
    expect(isJsonRpcError(ok)).toBe(false);
    expect(isJsonRpcError(err)).toBe(true);
    expect(isJsonRpcSuccess(err)).toBe(false);
  });
});

describe('jsonRpc notification + payload guards', () => {
  it('isJsonRpcNotification matches notifications and rejects responses', () => {
    expect(isJsonRpcNotification({ jsonrpc: JSON_RPC_VERSION, method: 'm' })).toBe(true);
    expect(isJsonRpcNotification({ jsonrpc: JSON_RPC_VERSION, id: FOO_VALUE, method: 'm' })).toBe(false);
    expect(isJsonRpcNotification({ jsonrpc: JSON_RPC_VERSION })).toBe(false);
  });

  it('isJsonRpcErrorPayload validates the inner error shape', () => {
    expect(isJsonRpcErrorPayload({ code: SAMPLE_CODE, message: 'x' })).toBe(true);
    expect(isJsonRpcErrorPayload({ code: 'x', message: 'x' })).toBe(false);
    expect(isJsonRpcErrorPayload(null)).toBe(false);
  });
});
