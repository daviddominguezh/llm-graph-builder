import type { JSONSchema7 } from '@ai-sdk/provider';
import type { Tool } from 'ai';
import { jsonSchema, zodSchema } from 'ai';
import type { z } from 'zod';

import { logger } from '../utils/logger.js';

export type ToolErrorCode =
  | 'no_store_bound'
  | 'protected_key'
  | 'key_too_long'
  | 'value_too_large'
  | 'invalid_pattern'
  | 'pattern_timeout'
  | 'tenant_not_allowed'
  | 'upstream_error';

export class ToolError extends Error {
  public readonly code: ToolErrorCode;
  constructor(code: ToolErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ToolError';
  }
}

/**
 * Raw JSON Schema shape that MCP servers send (Draft-07 subset).
 * Aliased to JSONSchema7 from @ai-sdk/provider so it is directly compatible
 * with the ai SDK's jsonSchema() wrapper without any casting.
 */
export type RawJsonSchema = JSONSchema7;

export type ToolInputSchema = z.ZodType | RawJsonSchema;

/**
 * Project-local tool shape. Decouples Provider implementations from the AI SDK's
 * `Tool` type so AI SDK breaking changes don't cascade across every provider.
 *
 * Built-in providers (calendar/forms/lead_scoring/composition) author tools using
 * Zod schemas — the cleanest DX for our internal tools. MCP tools, by contrast,
 * arrive from the server as raw JSON Schema; passing them through unchanged
 * preserves full schema fidelity for the LLM.
 *
 * Adapter `toAiSdkTool` is the only place that imports from 'ai'.
 */
export interface OpenFlowTool<Output = unknown> {
  description: string;
  inputSchema: ToolInputSchema;
  execute: (args: unknown) => Promise<Output> | Output;
}

function isZodSchema(value: ToolInputSchema): value is z.ZodType {
  // Zod schemas carry an internal `_def` property; plain JSON Schema objects do not.
  // Both union members are object types, so a simple `in` check is sufficient.
  return '_def' in value;
}

/**
 * Wraps execute() with timing + ToolError code observability. `toolName` here is
 * the dict-key the AI SDK presents to the LLM — when called via toAiSdkToolDict
 * downstream of buildSelected / resolveToolsForCurrentNode it is the namespaced
 * `${providerId}__${toolName}` form, so log lines match the name the LLM saw.
 */
function instrumentedExecute<O>(t: OpenFlowTool<O>, toolName: string): (args: unknown) => Promise<O> {
  return async (args: unknown): Promise<O> => {
    const start = Date.now();
    try {
      const result = await t.execute(args);
      logger.info(`[tool] ${toolName} ok ms=${Date.now() - start}`);
      return result;
    } catch (err) {
      const code = err instanceof ToolError ? err.code : 'unknown';
      logger.warn(`[tool] ${toolName} fail ms=${Date.now() - start} code=${code}`);
      throw err;
    }
  };
}

export function toAiSdkTool<O>(t: OpenFlowTool<O>, toolName = 'unknown'): Tool {
  const wrapped = isZodSchema(t.inputSchema) ? zodSchema(t.inputSchema) : jsonSchema(t.inputSchema);
  return {
    description: t.description,
    inputSchema: wrapped,
    execute: instrumentedExecute(t, toolName),
  };
}

export function toAiSdkToolDict(tools: Record<string, OpenFlowTool>): Record<string, Tool> {
  const out: Record<string, Tool> = {};
  for (const [name, tool] of Object.entries(tools)) out[name] = toAiSdkTool(tool, name);
  return out;
}

/**
 * Namespace separator used to encode `(providerId, toolName)` into a single
 * LLM-facing tool name. Universally allowed by every major LLM provider's
 * tool-name regex `^[A-Za-z0-9_-]+$`.
 */
export const TOOL_NAMESPACE_SEPARATOR = '__';

/**
 * Build the LLM-facing tool name from a provider id and tool name. Used as the
 * single source of truth so the separator is never hardcoded elsewhere.
 */
export function namespaceToolName(providerId: string, toolName: string): string {
  return `${providerId}${TOOL_NAMESPACE_SEPARATOR}${toolName}`;
}

/**
 * Parse an LLM-supplied namespaced tool name back into `(providerId, toolName)`.
 * Splits on the FIRST `__` so tool names containing `__` survive the round-trip.
 * Returns `null` for malformed input — callers must handle defensively.
 */
const NOT_FOUND = -1;
const FIRST_SLICE_START = 0;
const EMPTY_LENGTH = 0;

export function parseNamespacedToolName(name: string): { providerId: string; toolName: string } | null {
  const idx = name.indexOf(TOOL_NAMESPACE_SEPARATOR);
  if (idx === NOT_FOUND) return null;
  const providerId = name.slice(FIRST_SLICE_START, idx);
  const toolName = name.slice(idx + TOOL_NAMESPACE_SEPARATOR.length);
  if (providerId.length === EMPTY_LENGTH || toolName.length === EMPTY_LENGTH) return null;
  return { providerId, toolName };
}

export interface KvPagedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  truncated?: true;
}

export type KvSearchTarget = 'keys' | 'values' | 'both';

export interface KvSearchArgs {
  tenantId: string;
  on: KvSearchTarget;
  query: string;
  offset: number;
  limit: number;
}

export interface KvRegexArgs {
  tenantId: string;
  on: KvSearchTarget;
  pattern: string;
  offset: number;
  limit: number;
}

export interface KvStoreServices {
  storeId: string;
  listKeys: (tenantId: string, offset: number, limit: number) => Promise<KvPagedResult<string>>;
  getValues: (tenantId: string, keys: string[]) => Promise<Record<string, string | null>>;
  searchSubstring: (args: KvSearchArgs) => Promise<KvPagedResult<{ key: string; value: string }>>;
  searchRegex: (args: KvRegexArgs) => Promise<KvPagedResult<{ key: string; value: string }>>;
  updateValue: (tenantId: string, key: string, value: string) => Promise<{ success: true }>;
}

export interface RagSearchArgs {
  tenantId: string;
  query: string;
  minSimilarity: number;
  offset: number;
  limit: number;
}

export interface RagRegexArgs {
  tenantId: string;
  pattern: string;
  offset: number;
  limit: number;
}

export interface RagStoreServices {
  storeId: string;
  searchBm25: (
    tenantId: string,
    query: string,
    offset: number,
    limit: number
  ) => Promise<KvPagedResult<string>>;
  searchSemantic: (args: RagSearchArgs) => Promise<KvPagedResult<string>>;
  searchHybrid: (args: RagSearchArgs) => Promise<KvPagedResult<string>>;
  searchRegex: (args: RagRegexArgs) => Promise<KvPagedResult<string>>;
}

export function isKvStoreServices(v: unknown): v is KvStoreServices {
  return (
    typeof v === 'object' &&
    v !== null &&
    'storeId' in v &&
    typeof (v as { storeId: unknown }).storeId === 'string' &&
    'listKeys' in v &&
    typeof (v as { listKeys: unknown }).listKeys === 'function'
  );
}

export function isRagStoreServices(v: unknown): v is RagStoreServices {
  return (
    typeof v === 'object' &&
    v !== null &&
    'storeId' in v &&
    typeof (v as { storeId: unknown }).storeId === 'string' &&
    'searchBm25' in v &&
    typeof (v as { searchBm25: unknown }).searchBm25 === 'function'
  );
}
