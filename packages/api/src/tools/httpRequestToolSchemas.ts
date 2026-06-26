import { z } from 'zod';

const MIN_TIMEOUT_MS = 1;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 10_000;

const httpMethod = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

const headerValue = z.string();

const queryParamValue = z.union([z.string(), z.number(), z.boolean()]);

const jsonBody = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

export const httpRequestInput = z.object({
  method: httpMethod,
  url: z.url(),
  headers: z.record(z.string(), headerValue).optional(),
  query_params: z.record(z.string(), queryParamValue).optional(),
  body: jsonBody.optional(),
  timeout_ms: z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).optional(),
});

export type HttpRequestInput = z.infer<typeof httpRequestInput>;

export { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
