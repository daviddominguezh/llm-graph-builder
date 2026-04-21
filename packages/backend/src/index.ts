#!/usr/bin/env node
import { runStartupChecks } from './lib/startupChecks.js';
import { initializeSocketIO } from './messaging/socket/index.js';
import { loadCompletionConfig } from './notifications/completionNotifier.js';
import { InProcessCompletionNotifier } from './notifications/inProcessCompletionNotifier.js';
import { setNotifier } from './notifications/notifierSingleton.js';
import { RedisCompletionNotifier } from './notifications/redisCompletionNotifier.js';
import { fetchAndCacheModels } from './openrouter/modelCache.js';
import { createApp } from './server.js';
import { startChildExecutionWorker } from './workers/childExecutionWorker.js';
import { startResumeWorker } from './workers/resumeWorker.js';

const DEFAULT_PORT = 4000;

// Initialize CompletionNotifier
const completionConfig = loadCompletionConfig();
const { env } = process;
const useRedis = (env.NODE_ENV ?? '') !== 'test' && (env.REDIS_URL ?? '') !== '';
const notifier = useRedis ? new RedisCompletionNotifier(completionConfig) : new InProcessCompletionNotifier();
setNotifier(notifier, completionConfig);

const ZERO = 0;
const envPort = Number(env.PORT);
const port = Number.isNaN(envPort) || envPort === ZERO ? DEFAULT_PORT : envPort;
const app = createApp();

await runStartupChecks(app);

const server = app.listen(port, () => {
  process.stdout.write(`Graph Runner Backend listening on port ${String(port)}\n`);
  void fetchAndCacheModels();
});

initializeSocketIO(server);
startResumeWorker();
startChildExecutionWorker();

function handleShutdown(): void {
  process.stdout.write('[server] shutting down...\n');
  notifier.shutdown();
  server.close();
}

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);
