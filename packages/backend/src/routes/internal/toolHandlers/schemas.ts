import { z } from 'zod';

const OFFSET_MIN = 0;
const LIMIT_MIN = 1;
const KV_LIMIT_MAX = 500;
const RAG_LIMIT_MAX = 200;
const PATTERN_MAX = 1024;
const QUERY_MAX_KV = 2048;
const QUERY_MAX_RAG = 4096;
const KEY_MAX_BYTES = 256;
const KEYS_MAX_ITEMS = 100;
const SIMILARITY_FLOOR = 0;
const SIMILARITY_CEIL = 1;

const offsetSchema = z.number().int().min(OFFSET_MIN);
const kvLimitSchema = z.number().int().min(LIMIT_MIN).max(KV_LIMIT_MAX);
const ragLimitSchema = z.number().int().min(LIMIT_MIN).max(RAG_LIMIT_MAX);
const kvOnSchema = z.enum(['keys', 'values', 'both']);

const baseSchema = z.object({
  tenantId: z.string().min(LIMIT_MIN),
  storeId: z.string().min(LIMIT_MIN),
});

export const ListKeysBodySchema = baseSchema.extend({
  offset: offsetSchema,
  limit: kvLimitSchema,
});
export type ListKeysBody = z.infer<typeof ListKeysBodySchema>;

export const GetValuesBodySchema = baseSchema.extend({
  keys: z.array(z.string().max(KEY_MAX_BYTES)).max(KEYS_MAX_ITEMS),
});
export type GetValuesBody = z.infer<typeof GetValuesBodySchema>;

export const KvSearchBodySchema = z.discriminatedUnion('mode', [
  baseSchema.extend({
    mode: z.literal('substring'),
    on: kvOnSchema,
    query: z.string().min(LIMIT_MIN).max(QUERY_MAX_KV),
    offset: offsetSchema,
    limit: kvLimitSchema,
  }),
  baseSchema.extend({
    mode: z.literal('regex'),
    on: kvOnSchema,
    pattern: z.string().min(LIMIT_MIN).max(PATTERN_MAX),
    offset: offsetSchema,
    limit: kvLimitSchema,
  }),
]);
export type KvSearchBody = z.infer<typeof KvSearchBodySchema>;

export const UpdateValueBodySchema = baseSchema.extend({
  key: z.string().min(LIMIT_MIN),
  value: z.string(),
});
export type UpdateValueBody = z.infer<typeof UpdateValueBodySchema>;

export const RagSearchBodySchema = z.discriminatedUnion('mode', [
  baseSchema.extend({
    mode: z.literal('bm25'),
    query: z.string().min(LIMIT_MIN).max(QUERY_MAX_RAG),
    offset: offsetSchema,
    limit: ragLimitSchema,
  }),
  baseSchema.extend({
    mode: z.literal('semantic'),
    query: z.string().min(LIMIT_MIN).max(QUERY_MAX_RAG),
    minSimilarity: z.number().min(SIMILARITY_FLOOR).max(SIMILARITY_CEIL),
    offset: offsetSchema,
    limit: ragLimitSchema,
  }),
  baseSchema.extend({
    mode: z.literal('hybrid'),
    query: z.string().min(LIMIT_MIN).max(QUERY_MAX_RAG),
    minSimilarity: z.number().min(SIMILARITY_FLOOR).max(SIMILARITY_CEIL),
    offset: offsetSchema,
    limit: ragLimitSchema,
  }),
  baseSchema.extend({
    mode: z.literal('regex'),
    pattern: z.string().min(LIMIT_MIN).max(PATTERN_MAX),
    offset: offsetSchema,
    limit: ragLimitSchema,
  }),
]);
export type RagSearchBody = z.infer<typeof RagSearchBodySchema>;
