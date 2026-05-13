import { McpError } from './errors.js';
import {
  type JsonRpcNotification,
  type JsonRpcResponse,
  isJsonRpcError,
  isJsonRpcSuccess,
} from './jsonRpc.js';
import type { PendingMap } from './sseState.js';
import type { OnNotificationHandler } from './transport.js';

type ResponseGuard = (msg: unknown) => msg is JsonRpcResponse;
type NotificationGuard = (msg: unknown) => msg is JsonRpcNotification;

function dispatchResponse(pending: PendingMap, response: JsonRpcResponse): void {
  const { id } = response;
  if (id === null) return;
  if (isJsonRpcError(response)) {
    pending.reject(id, new McpError(response.error.code, response.error.message, response.error.data));
    return;
  }
  if (isJsonRpcSuccess(response)) pending.resolve(id, response.result);
}

interface DispatchArgs {
  parsed: unknown;
  pending: PendingMap;
  onNotification: OnNotificationHandler | undefined;
  isResponse: ResponseGuard;
  isNotification: NotificationGuard;
}

/**
 * Route a parsed JSON value (a JSON-RPC message) to the appropriate handler:
 * matching pending request, or notification listener. Used by the stdio
 * transport to keep the I/O code free of dispatch logic.
 */
export function dispatchJsonValue(args: DispatchArgs): void {
  const { parsed, pending, onNotification, isResponse, isNotification } = args;
  if (isResponse(parsed)) {
    dispatchResponse(pending, parsed);
    return;
  }
  if (isNotification(parsed) && onNotification !== undefined) onNotification(parsed);
}
