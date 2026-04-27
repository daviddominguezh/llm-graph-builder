import { McpError, TransportError } from './errors.js';
import {
  type JsonRpcResponse,
  isJsonRpcError,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isJsonRpcSuccess,
} from './jsonRpc.js';
import type { SseEvent } from './sseParser.js';
import type { OnNotificationHandler } from './transport.js';

/**
 * Pending-request bookkeeping shared across SSE/stdio streams. Each outgoing
 * request gets registered with an id; the reader resolves or rejects it as
 * messages arrive.
 */

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export class PendingMap {
  private readonly map = new Map<number | string, Pending>();

  add(id: number | string, resolve: (value: unknown) => void, reject: (reason: unknown) => void): void {
    this.map.set(id, { resolve, reject });
  }

  resolve(id: number | string, value: unknown): boolean {
    const pending = this.map.get(id);
    if (pending === undefined) return false;
    this.map.delete(id);
    pending.resolve(value);
    return true;
  }

  reject(id: number | string, reason: unknown): boolean {
    const pending = this.map.get(id);
    if (pending === undefined) return false;
    this.map.delete(id);
    pending.reject(reason);
    return true;
  }

  rejectAll(reason: unknown): void {
    for (const pending of this.map.values()) pending.reject(reason);
    this.map.clear();
  }
}

function dispatchResponse(pending: PendingMap, response: JsonRpcResponse): void {
  const { id } = response;
  if (id === null) return;
  if (isJsonRpcError(response)) {
    pending.reject(id, new McpError(response.error.code, response.error.message, response.error.data));
    return;
  }
  if (isJsonRpcSuccess(response)) pending.resolve(id, response.result);
}

function parseSseData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch (err) {
    throw new TransportError('Invalid JSON in SSE event', err);
  }
}

export function dispatchEvent(
  event: SseEvent,
  pending: PendingMap,
  onNotification: OnNotificationHandler | undefined
): void {
  const parsed = parseSseData(event.data);
  if (isJsonRpcResponse(parsed)) {
    dispatchResponse(pending, parsed);
    return;
  }
  if (isJsonRpcNotification(parsed) && onNotification !== undefined) onNotification(parsed);
}
