// Shared fetch mock helpers and constants for GitHub provider tests

export const STATUS_OK = 200;
export const STATUS_UNAUTHORIZED = 401;
export const STATUS_FORBIDDEN = 403;
export const STATUS_NOT_FOUND = 404;
export const STATUS_UNPROCESSABLE = 422;
export const STATUS_TOO_MANY = 429;
export const STATUS_BAD_REQUEST = 400;
export const STATUS_BAD_GATEWAY = 502;

export const RL_REMAINING = 4500;
export const RL_REMAINING_LOW = 4000;
export const RL_REMAINING_ZERO = 0;
export const RL_REMAINING_NONZERO = 100;
export const RL_RESET_EPOCH = 1700000000;
export const RL_RESET_EPOCH_MS = 1700000000000;
export const RL_LIMIT = 5000;

export const TIMEOUT_SHORT = 10;
export const TIMEOUT_MEDIUM = 5000;
export const TIMEOUT_TEST = 10000;
export const MOCK_DELAY_MS = 50;

export const FETCH_CALL_FIRST = 0;
export const FETCH_CALL_SECOND = 1;
export const CALL_COUNT_ONE = 1;
export const CALL_COUNT_TWO = 2;
export const CALL_COUNT_THREE = 3;

export const BFS_OVERFLOW_DEPTH = 21;

// Byte constants for test Uint8Arrays
export const HELLO_BYTES = new TextEncoder().encode('Hello');
export const SMALL_BYTES = new TextEncoder().encode('abc');
export const BINARY_BYTE_NULL = 0x00;
export const BINARY_BYTE_FF = 0xff;
export const BINARY_BYTE_89 = 0x89;
export const BINARY_BYTE_50 = 0x50;
export const BINARY_BYTES = new Uint8Array([
  BINARY_BYTE_NULL,
  BINARY_BYTE_FF,
  BINARY_BYTE_89,
  BINARY_BYTE_50,
]);
export const BYTE_INDEX_0 = 0;
export const BYTE_INDEX_1 = 1;
export const BYTE_INDEX_2 = 2;
export const BYTE_INDEX_3 = 3;

export function rateLimitHeaders(
  remaining: number,
  resetEpoch: number,
  limit: number
): Record<string, string> {
  return {
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-reset': String(resetEpoch),
    'x-ratelimit-limit': String(limit),
  };
}

export function mockResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

export function mockBlobResponse(
  status: number,
  content: Uint8Array,
  headers?: Record<string, string>
): Response {
  return new Response(content, { status, headers });
}
