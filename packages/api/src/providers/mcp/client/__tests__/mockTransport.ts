import type { McpTransport } from '../../transport/transport.js';

export interface RecordedCall {
  method: string;
  params?: unknown;
}

export interface MockTransport extends McpTransport {
  readonly requests: RecordedCall[];
  readonly notifications: RecordedCall[];
  responses: Map<string, unknown>;
  readonly closed: boolean;
}

export function createMockTransport(): MockTransport {
  const requests: RecordedCall[] = [];
  const notifications: RecordedCall[] = [];
  const responses = new Map<string, unknown>();
  let session: string | null = null;
  let closed = false;

  const request: McpTransport['request'] = async (method, params) => {
    requests.push({ method, params });
    await Promise.resolve();
    if (!responses.has(method)) throw new Error(`no canned response for ${method}`);
    return responses.get(method);
  };

  const notify: McpTransport['notify'] = async (method, params) => {
    notifications.push({ method, params });
    await Promise.resolve();
  };

  return {
    requests,
    notifications,
    responses,
    get sessionId() {
      return session;
    },
    get closed() {
      return closed;
    },
    setSessionId: (id) => {
      session = id;
    },
    close: async () => {
      closed = true;
      await Promise.resolve();
    },
    request,
    notify,
  };
}
