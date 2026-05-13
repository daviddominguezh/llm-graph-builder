import type { FetchLike } from '../../transport.js';

const STATUS_OK = 200;

export interface CapturedCall {
  url: string;
  init: RequestInit;
}

export interface FetchMock {
  fn: FetchLike;
  calls: CapturedCall[];
}

export function makeJsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const headers = new Headers(init.headers);
  return new Response(JSON.stringify(body), { status: init.status ?? STATUS_OK, headers });
}

export function makeStreamResponse(
  chunks: Uint8Array[],
  init: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const headers = new Headers({ 'Content-Type': 'text/event-stream', ...(init.headers ?? {}) });
  return new Response(stream, { status: init.status ?? STATUS_OK, headers });
}

export function encodeSse(messages: string[]): Uint8Array {
  const text = messages.map((m) => `data: ${m}\n\n`).join('');
  return new TextEncoder().encode(text);
}

const ARRAY_LAST_INDEX_OFFSET = 1;

export function fetchSequence(handler: (call: CapturedCall, index: number) => Response): FetchMock {
  const calls: CapturedCall[] = [];
  const fn: FetchLike = async (input, init) => {
    const captured: CapturedCall = { url: input, init };
    calls.push(captured);
    await Promise.resolve();
    return handler(captured, calls.length - ARRAY_LAST_INDEX_OFFSET);
  };
  return { fn, calls };
}

export function constantFetch(response: Response): FetchMock {
  return fetchSequence(() => response);
}
