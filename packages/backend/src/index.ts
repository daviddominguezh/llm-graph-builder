#!/usr/bin/env node
import { createApp } from './server.js';

const DEFAULT_PORT = 4000;

const ZERO = 0;
const envPort = Number(process.env.PORT);
const port = Number.isNaN(envPort) || envPort === ZERO ? DEFAULT_PORT : envPort;
const app = createApp();

app.listen(port, () => {
  process.stdout.write(`Graph Runner Backend listening on port ${String(port)}\n`);
});
