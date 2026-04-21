/**
 * Test script: verify Redis Cloud connection and Pub/Sub with ioredis.
 *
 * Run: npx tsx scripts/test-redis-cloud.ts
 *
 * Tests:
 * 1. Basic connection (PING)
 * 2. SET/GET round-trip
 * 3. Pub/Sub: subscriber receives published message
 * 4. Pub/Sub: subscribe-before-publish (race condition safety)
 * 5. Cleanup
 */
import Redis from 'ioredis';

const REDIS_URL = process.env['REDIS_URL'] ?? '';
const TEST_CHANNEL = 'test:completion:abc-123';
const TEST_KEY = 'test:connection:probe';
const TIMEOUT_MS = 10_000;

function log(label: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${label}] ${msg}`);
}

function fail(msg: string): never {
  console.error(`\n❌ FAILED: ${msg}\n`);
  process.exit(1);
}

async function testConnection(redis: Redis): Promise<void> {
  log('1/5', 'Testing PING...');
  const pong = await redis.ping();
  if (pong !== 'PONG') fail(`Expected PONG, got: ${pong}`);
  log('1/5', `PING → ${pong} ✓`);
}

async function testSetGet(redis: Redis): Promise<void> {
  log('2/5', 'Testing SET/GET...');
  await redis.set(TEST_KEY, 'hello-redis-cloud', 'EX', 30);
  const value = await redis.get(TEST_KEY);
  if (value !== 'hello-redis-cloud') fail(`Expected 'hello-redis-cloud', got: ${String(value)}`);
  log('2/5', `SET/GET round-trip ✓`);
}

async function testPubSub(redis: Redis): Promise<void> {
  log('3/5', 'Testing Pub/Sub...');

  // ioredis requires a SEPARATE connection for subscribe mode
  const subscriber = new Redis(REDIS_URL);
  const payload = JSON.stringify({
    status: 'completed',
    text: 'child agent result',
    executionId: 'exec-test-001',
  });

  const received = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Pub/Sub timeout — no message received within 10s')),
      TIMEOUT_MS
    );

    subscriber.subscribe(TEST_CHANNEL, (err) => {
      if (err !== null) {
        clearTimeout(timer);
        reject(err);
        return;
      }
      log('3/5', `Subscribed to "${TEST_CHANNEL}"`);

      // Publish AFTER subscribe is confirmed
      setTimeout(() => {
        log('3/5', 'Publishing message...');
        void redis.publish(TEST_CHANNEL, payload);
      }, 100);
    });

    subscriber.on('message', (channel: string, message: string) => {
      clearTimeout(timer);
      log('3/5', `Received on "${channel}": ${message.slice(0, 80)}...`);
      resolve(message);
    });
  });

  const parsed: unknown = JSON.parse(received);
  if (typeof parsed !== 'object' || parsed === null) fail('Parsed message is not an object');
  const obj = parsed as Record<string, unknown>;
  if (obj['status'] !== 'completed') fail(`Expected status=completed, got: ${String(obj['status'])}`);
  if (obj['executionId'] !== 'exec-test-001')
    fail(`Expected executionId=exec-test-001, got: ${String(obj['executionId'])}`);
  log('3/5', 'Pub/Sub message received and validated ✓');

  await subscriber.unsubscribe(TEST_CHANNEL);
  log('3/5', 'Unsubscribed ✓');
  subscriber.disconnect();
}

async function testSubscribeBeforePublish(redis: Redis): Promise<void> {
  log('4/5', 'Testing subscribe-before-publish (race condition safety)...');
  const channel = 'test:race:def-456';
  const subscriber = new Redis(REDIS_URL);

  const received = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Race condition test timeout')), TIMEOUT_MS);

    // Step 1: Subscribe first
    subscriber.subscribe(channel, (err) => {
      if (err !== null) {
        clearTimeout(timer);
        reject(err);
        return;
      }
      log('4/5', 'Subscriber ready — publishing 200ms later...');

      // Step 2: Simulate worker publishing after a delay (like in production)
      setTimeout(() => {
        void redis.publish(channel, 'race-ok');
      }, 200);
    });

    subscriber.on('message', (_ch: string, message: string) => {
      clearTimeout(timer);
      resolve(message);
    });
  });

  if (received !== 'race-ok') fail(`Expected 'race-ok', got: ${received}`);
  log('4/5', 'Subscribe-before-publish confirmed safe ✓');

  await subscriber.unsubscribe(channel);
  subscriber.disconnect();
}

async function cleanup(redis: Redis): Promise<void> {
  log('5/5', 'Cleaning up test keys...');
  await redis.del(TEST_KEY);
  log('5/5', 'Cleanup done ✓');
}

async function main(): Promise<void> {
  if (REDIS_URL === '') {
    fail('REDIS_URL environment variable is not set. Add it to .env');
  }

  console.log('\n🔌 Redis Cloud Connection & Pub/Sub Test');
  console.log(`   URL: ${REDIS_URL.replace(/:[^:@]+@/, ':***@')}\n`);

  const redis = new Redis(REDIS_URL);

  try {
    await testConnection(redis);
    await testSetGet(redis);
    await testPubSub(redis);
    await testSubscribeBeforePublish(redis);
    await cleanup(redis);

    console.log('\n✅ All tests passed! Redis Cloud + ioredis Pub/Sub is working.\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(msg);
  } finally {
    redis.disconnect();
  }
}

void main();
