import { Redis } from '@upstash/redis';

import { isCacheableSize, mcpCurrentVersionKey, mcpToolsListKey } from '../../cache/mcpToolsListCache.js';
import { serverUrlSideTableKey } from '../../cache/serverHash.js';
import type { ProviderCtx, ToolDescriptor } from '../provider.js';

const TOOLS_LIST_TTL_SECONDS = 86_400;
const SIDE_TABLE_TTL_SECONDS = 86_400;
const EMPTY_TOOLS_LENGTH = 0;

let cachedRedis: Redis | null = null;

export function getMcpRedis(): Redis | null {
  if (cachedRedis !== null) return cachedRedis;
  const url: string | undefined = process.env.UPSTASH_REDIS_REST_URL;
  const token: string | undefined = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url === undefined || token === undefined) return null;
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface CachedToolsList {
  serverHash: string;
  tools: ToolDescriptor[];
  cachedAt: number;
}

function isCachedToolsList(value: unknown): value is CachedToolsList {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { serverHash?: unknown; tools?: unknown; cachedAt?: unknown };
  return typeof v.serverHash === 'string' && Array.isArray(v.tools) && typeof v.cachedAt === 'number';
}

export async function tryReadCachedTools(
  orgId: string,
  serverHash: string,
  version: string,
  logger: ProviderCtx['logger']
): Promise<CachedToolsList | null> {
  const redis = getMcpRedis();
  if (redis === null) return null;
  const key = mcpToolsListKey(orgId, serverHash, version);
  try {
    const raw = await redis.get<string>(key);
    if (raw === null) return null;
    const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!isCachedToolsList(parsed)) {
      logger.warn(`[mcp-cache] invalid cached value at ${key}`);
      return null;
    }
    return parsed;
  } catch (err) {
    logger.warn(`[mcp-cache] read error ${key}: ${errMsg(err)}`);
    return null;
  }
}

export interface ToolsCacheWriteArgs {
  orgId: string;
  serverHash: string;
  serverUrl: string;
  tools: ToolDescriptor[];
  version: string;
  cachedAt: number;
}

export async function tryWriteCachedTools(
  args: ToolsCacheWriteArgs,
  logger: ProviderCtx['logger']
): Promise<void> {
  if (args.tools.length === EMPTY_TOOLS_LENGTH) return;
  const redis = getMcpRedis();
  if (redis === null) return;
  const value: CachedToolsList = { serverHash: args.serverHash, tools: args.tools, cachedAt: args.cachedAt };
  const serialized = JSON.stringify(value);
  if (!isCacheableSize(serialized)) {
    logger.warn('[mcp-cache] skipped write: value too large');
    return;
  }
  const key = mcpToolsListKey(args.orgId, args.serverHash, args.version);
  try {
    await redis.setex(key, TOOLS_LIST_TTL_SECONDS, serialized);
    const sideEntry = JSON.stringify({ serverUrl: args.serverUrl, firstSeenAt: args.cachedAt });
    await redis.setex(serverUrlSideTableKey(args.serverHash), SIDE_TABLE_TTL_SECONDS, sideEntry);
  } catch (err) {
    logger.warn(`[mcp-cache] write error ${key}: ${errMsg(err)}`);
  }
}

export async function tryWriteCurrentVersion(
  orgId: string,
  serverHash: string,
  version: string,
  logger: ProviderCtx['logger']
): Promise<void> {
  const redis = getMcpRedis();
  if (redis === null) return;
  const key = mcpCurrentVersionKey(orgId, serverHash);
  try {
    await redis.setex(key, TOOLS_LIST_TTL_SECONDS, version);
  } catch (err) {
    logger.warn(`[mcp-cache] write error ${key}: ${errMsg(err)}`);
  }
}

export async function tryReadCurrentVersion(
  orgId: string,
  serverHash: string,
  logger: ProviderCtx['logger']
): Promise<string | null> {
  const redis = getMcpRedis();
  if (redis === null) return null;
  const key = mcpCurrentVersionKey(orgId, serverHash);
  try {
    return await redis.get<string>(key);
  } catch (err) {
    logger.warn(`[mcp-cache] read error ${key}: ${errMsg(err)}`);
    return null;
  }
}
