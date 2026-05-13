/**
 * JSON-RPC 2.0 message types and helpers used by the MCP transport layer.
 *
 * MCP runs over JSON-RPC 2.0. We only model the subset we send/receive:
 * Request, Notification, and Response (success or error).
 */

export const JSON_RPC_VERSION = '2.0';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess<T = unknown> {
  jsonrpc: '2.0';
  id: number | string;
  result: T;
}

export interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  error: JsonRpcErrorPayload;
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcErrorResponse;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

function isPlainObject(msg: unknown): msg is Record<string, unknown> {
  return typeof msg === 'object' && msg !== null;
}

export function isJsonRpcSuccess<T>(msg: JsonRpcResponse<T>): msg is JsonRpcSuccess<T> {
  return 'result' in msg;
}

export function isJsonRpcError(msg: JsonRpcResponse): msg is JsonRpcErrorResponse {
  return 'error' in msg;
}

export function isJsonRpcResponse(msg: unknown): msg is JsonRpcResponse {
  if (!isPlainObject(msg)) return false;
  if (msg.jsonrpc !== JSON_RPC_VERSION) return false;
  if (!('id' in msg)) return false;
  return 'result' in msg || 'error' in msg;
}

export function isJsonRpcNotification(msg: unknown): msg is JsonRpcNotification {
  if (!isPlainObject(msg)) return false;
  if (msg.jsonrpc !== JSON_RPC_VERSION) return false;
  if ('id' in msg) return false;
  return typeof msg.method === 'string';
}

export function isJsonRpcErrorPayload(value: unknown): value is JsonRpcErrorPayload {
  if (!isPlainObject(value)) return false;
  return typeof value.code === 'number' && typeof value.message === 'string';
}

export function buildRequest(id: number | string, method: string, params?: unknown): JsonRpcRequest {
  return { jsonrpc: JSON_RPC_VERSION, id, method, params };
}

export function buildNotification(method: string, params?: unknown): JsonRpcNotification {
  return { jsonrpc: JSON_RPC_VERSION, method, params };
}
