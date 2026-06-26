/**
 * Admin: flush MCP cache entries for a specific server URL across all orgs.
 *
 * Deletes:
 *   - mcp_tools:v1:*:{serverHash}:*  (every version key for every org)
 *   - mcp_session:v1:*:{serverHash}  (session entries)
 *   - mcp_url:v1:{serverHash}        (side table)
 *
 * Run:
 *   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
 *     npx tsx scripts/flush-mcp-cache-by-server.ts <serverUrl>
 */
import { hashServerUrl, serverUrlSideTableKey } from '@daviddh/llm-graph-runner';
import { Redis } from '@upstash/redis';

const SCAN_COUNT = 500;
const ZERO_CURSOR = '0';
const EXIT_OK = 0;
const EXIT_ERR = 1;

function getArgs(): { serverUrl: string } {
  const [, , serverUrl] = process.argv;
  if (serverUrl === undefined || serverUrl === '') {
    console.error('Usage: tsx scripts/flush-mcp-cache-by-server.ts <serverUrl>');
    process.exit(EXIT_ERR);
  }
  return { serverUrl };
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
  const { serverUrl } = getArgs();
  const redis = getRedis();
  const serverHash = await hashServerUrl(serverUrl);
  const toolsKeys = await scanByPattern(redis, `mcp_tools:v1:*:${serverHash}:*`);
  const sessionKeys = await scanByPattern(redis, `mcp_session:v1:*:${serverHash}`);
  const versionKeys = await scanByPattern(redis, `mcp_current_version:v1:*:${serverHash}`);
  const sideKey = serverUrlSideTableKey(serverHash);
  const allKeys = [...toolsKeys, ...sessionKeys, ...versionKeys, sideKey];
  console.log(`Flushing ${String(allKeys.length)} keys for serverHash=${serverHash}`);
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
