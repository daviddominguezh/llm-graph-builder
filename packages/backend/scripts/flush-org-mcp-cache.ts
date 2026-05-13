/**
 * Admin: full MCP cache flush for a specific org.
 *
 * Deletes all `mcp_tools:v1:{orgId}:*` and `mcp_session:v1:{orgId}:*` entries
 * for the given org. Does not touch other orgs.
 *
 * Run:
 *   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
 *     npx tsx scripts/flush-org-mcp-cache.ts <orgId>
 */
import { Redis } from '@upstash/redis';

const SCAN_COUNT = 500;
const ZERO_CURSOR = '0';
const EXIT_OK = 0;
const EXIT_ERR = 1;

function getArgs(): { orgId: string } {
  const [, , orgId] = process.argv;
  if (orgId === undefined || orgId === '') {
    console.error('Usage: tsx scripts/flush-org-mcp-cache.ts <orgId>');
    process.exit(EXIT_ERR);
  }
  return { orgId };
}

function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url === undefined || token === undefined) {
    console.error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
    process.exit(EXIT_ERR);
  }
  return new Redis({ url, token });
}

async function scanByPattern(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = ZERO_CURSOR;
  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: pattern, count: SCAN_COUNT });
    keys.push(...batch);
    cursor = nextCursor;
  } while (cursor !== ZERO_CURSOR);
  return keys;
}

async function main(): Promise<void> {
  const { orgId } = getArgs();
  const redis = getRedis();
  const toolsKeys = await scanByPattern(redis, `mcp_tools:v1:${orgId}:*`);
  const sessionKeys = await scanByPattern(redis, `mcp_session:v1:${orgId}:*`);
  const versionKeys = await scanByPattern(redis, `mcp_current_version:v1:${orgId}:*`);
  const allKeys = [...toolsKeys, ...sessionKeys, ...versionKeys];
  console.log(`Flushing ${String(allKeys.length)} keys for orgId=${orgId}`);
  if (allKeys.length === 0) {
    process.exit(EXIT_OK);
  }
  const deleted = await redis.del(...allKeys);
  console.log(`Deleted ${String(deleted)} keys`);
  process.exit(EXIT_OK);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(EXIT_ERR);
});
