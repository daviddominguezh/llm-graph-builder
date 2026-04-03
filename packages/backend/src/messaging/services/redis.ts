import { Redis } from '@upstash/redis';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

let redisInstance: Redis | null = null;

function getRedis(): Redis {
  if (redisInstance === null) {
    redisInstance = new Redis({
      url: getRequiredEnv('UPSTASH_REDIS_REST_URL'),
      token: getRequiredEnv('UPSTASH_REDIS_REST_TOKEN'),
    });
  }
  return redisInstance;
}

export function buildRedisChannel(tenantId: string): string {
  return `tenant:${tenantId}`;
}

export async function publishToTenant(tenantId: string, payload: unknown): Promise<void> {
  const redis = getRedis();
  const channel = buildRedisChannel(tenantId);
  await redis.publish(channel, JSON.stringify(payload));
}
