/**
 * E2E integration test: verify CompletionNotifier works against live Redis Cloud.
 *
 * Run: cd packages/backend && source .env && export REDIS_URL && npx tsx scripts/test-completion-flow.ts
 *
 * Tests:
 * 1. Happy path: subscribe → notify (300ms delay) → verify received result
 * 2. Durable key fallback: notify first → subscribe → verify result found via key
 * 3. NX idempotency: notify twice with different results → verify first wins
 */
import { loadCompletionConfig, type ExecutionResult } from '../src/notifications/completionNotifier.js';
import { RedisCompletionNotifier } from '../src/notifications/redisCompletionNotifier.js';

function log(label: string, msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  process.stdout.write(`[${ts}] [${label}] ${msg}\n`);
}

function fail(msg: string): never {
  process.stderr.write(`\nFAILED: ${msg}\n\n`);
  process.exit(1);
}

const config = loadCompletionConfig();
const notifier = new RedisCompletionNotifier(config);

async function testHappyPath(): Promise<void> {
  const execId = `e2e-${Date.now()}-happy`;
  log('1/3', 'Happy path...');

  const waitPromise = notifier.waitForCompletion(execId, 10_000);
  await new Promise<void>((r) => setTimeout(r, 300));

  const result: ExecutionResult = { status: 'completed', text: 'recipe output', executionId: execId };
  await notifier.notifyCompletion(execId, result);

  const received = await waitPromise;
  if (received === null) throw new Error('Expected result, got null');
  if (received.text !== 'recipe output') throw new Error(`Wrong text: ${received.text}`);
  if (received.executionId !== execId) throw new Error(`Wrong executionId: ${received.executionId}`);
  if (received.status !== 'completed') throw new Error(`Wrong status: ${received.status}`);

  log('1/3', 'PASS');
}

async function testDurableKeyFallback(): Promise<void> {
  const execId = `e2e-${Date.now()}-durable`;
  log('2/3', 'Durable key fallback...');

  const result: ExecutionResult = { status: 'completed', text: 'durable output', executionId: execId };
  await notifier.notifyCompletion(execId, result);

  // Subscribe AFTER notify — Pub/Sub message is gone, must read from key
  const received = await notifier.waitForCompletion(execId, 10_000);
  if (received === null) throw new Error('Expected result via durable key, got null');
  if (received.text !== 'durable output') throw new Error(`Wrong text: ${received.text}`);
  if (received.executionId !== execId) throw new Error(`Wrong executionId: ${received.executionId}`);

  log('2/3', 'PASS');
}

async function testNxIdempotency(): Promise<void> {
  const execId = `e2e-${Date.now()}-nx`;
  log('3/3', 'NX idempotency...');

  const first: ExecutionResult = { status: 'completed', text: 'first result', executionId: execId };
  const second: ExecutionResult = { status: 'error', text: 'second result', executionId: execId };

  await notifier.notifyCompletion(execId, first);
  await notifier.notifyCompletion(execId, second);

  const received = await notifier.waitForCompletion(execId, 10_000);
  if (received === null) throw new Error('Expected result, got null');
  if (received.text !== 'first result') throw new Error(`Expected first result to win, got: ${received.text}`);
  if (received.status !== 'completed') throw new Error(`Expected first status, got: ${received.status}`);

  log('3/3', 'PASS');
}

async function main(): Promise<void> {
  const redisUrl = process.env['REDIS_URL'] ?? '';
  if (redisUrl === '') {
    fail('REDIS_URL environment variable is not set. Run: source .env && export REDIS_URL');
  }

  process.stdout.write('\nCompletionNotifier E2E Integration Test\n\n');

  try {
    await testHappyPath();
    await testDurableKeyFallback();
    await testNxIdempotency();
    process.stdout.write('\nAll 3 tests passed!\n\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(msg);
  } finally {
    notifier.shutdown();
  }
}

void main();
