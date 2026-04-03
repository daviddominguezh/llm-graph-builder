import type http from 'node:http';

import type { Socket } from 'socket.io';
import { Server } from 'socket.io';

import { setupSocketErrorHandling } from './errorHandler.js';
import { initializeSubscriptionHandlers, isSocketSubscribed } from './subscriptions.js';

/* ─── Constants ─── */

const PING_TIMEOUT_MS = 60_000;
const PING_INTERVAL_MS = 25_000;
const CONNECT_TIMEOUT_MS = 60_000;
const MAX_HTTP_BUFFER_SIZE = 5e6;
const SUBSCRIPTION_TIMEOUT_MS = 10_000;

/* ─── Environment ─── */

const DEFAULT_WEB_URL = 'http://localhost:3101';

function getWebUrl(): string {
  return process.env.WEB_URL ?? DEFAULT_WEB_URL;
}

/* ─── Subscription timeout management ─── */

const subscriptionTimeouts = new Map<string, NodeJS.Timeout>();

function scheduleSubscriptionTimeout(socket: Socket): void {
  const timeout = setTimeout(() => {
    if (!isSocketSubscribed(socket.id)) {
      process.stdout.write(
        `[socket] Disconnecting ${socket.id}: no subscription within ${String(SUBSCRIPTION_TIMEOUT_MS)}ms\n`
      );
      socket.disconnect(true);
    }
    subscriptionTimeouts.delete(socket.id);
  }, SUBSCRIPTION_TIMEOUT_MS);

  subscriptionTimeouts.set(socket.id, timeout);
}

function clearSubscriptionTimeout(socketId: string): void {
  const timeout = subscriptionTimeouts.get(socketId);
  if (timeout !== undefined) {
    clearTimeout(timeout);
    subscriptionTimeouts.delete(socketId);
  }
}

/* ─── Connection error logging ─── */

const SUPPRESSED_PATTERNS = ['terminated', 'BodyTimeoutError', 'UND_ERR_BODY_TIMEOUT'];

function logConnectionError(socketId: string, error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);

  if (SUPPRESSED_PATTERNS.some((p) => msg.includes(p))) {
    process.stdout.write(`[socket] Suppressed connection error for ${socketId}: ${msg}\n`);
    return;
  }

  process.stdout.write(`[socket] Connection error for ${socketId}: ${msg}\n`);
}

/* ─── Connection handler ─── */

function handleConnection(socket: Socket): void {
  process.stdout.write(`[socket] Client connected: ${socket.id}\n`);

  setupSocketErrorHandling(socket);
  scheduleSubscriptionTimeout(socket);

  socket.on('disconnect', (reason: string) => {
    clearSubscriptionTimeout(socket.id);
    process.stdout.write(`[socket] Client disconnected: ${socket.id} (${reason})\n`);
  });

  socket.on('connect_error', (error: Error) => {
    logConnectionError(socket.id, error);
  });
}

/* ─── Initialize Socket.IO ─── */

export function initializeSocketIO(server: http.Server): Server {
  const io = new Server(server, {
    cors: {
      origin: [getWebUrl()],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: PING_TIMEOUT_MS,
    pingInterval: PING_INTERVAL_MS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE,
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    handleConnection(socket);
  });

  initializeSubscriptionHandlers(io);

  process.stdout.write('[socket] Socket.IO initialized\n');

  return io;
}
