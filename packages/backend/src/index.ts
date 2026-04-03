#!/usr/bin/env node
import { initializeSocketIO } from './messaging/socket/index.js';
import { fetchAndCacheModels } from './openrouter/modelCache.js';
import { createApp } from './server.js';

const DEFAULT_PORT = 4000;

const ZERO = 0;
const envPort = Number(process.env.PORT);
const port = Number.isNaN(envPort) || envPort === ZERO ? DEFAULT_PORT : envPort;
const app = createApp();

const server = app.listen(port, () => {
  process.stdout.write(`Graph Runner Backend listening on port ${String(port)}\n`);
  void fetchAndCacheModels();
});

initializeSocketIO(server);
