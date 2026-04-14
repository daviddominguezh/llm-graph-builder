/**
 * Integration test: verify pub/sub works through the migrated redis.ts facade.
 * Run: source .env && npx tsx scripts/test-migration.ts
 */
import { subscribe } from '../src/messaging/services/redis.js';
import { publishMessage } from '../src/messaging/services/redisCloud.js';

const CHANNEL = 'tenant:test-migration';
const TIMEOUT_MS = 10_000;

console.log('\nTesting pub/sub through migrated redis.ts facade...\n');

const unsub = subscribe(CHANNEL, (msg: string) => {
  console.log(`[received] ${msg}`);
  unsub();
  console.log('\n✅ Migration integration test PASSED\n');
  setTimeout(() => process.exit(0), 500);
});

setTimeout(() => {
  console.log('[publishing] test message...');
  void publishMessage(CHANNEL, JSON.stringify({ type: 'migration-test', ok: true }));
}, 1500);

setTimeout(() => {
  console.log('\n❌ TIMEOUT — no message received\n');
  process.exit(1);
}, TIMEOUT_MS);
