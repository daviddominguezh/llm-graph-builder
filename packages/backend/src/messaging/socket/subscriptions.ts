import type { Server, Socket } from 'socket.io';

import { subscribe } from '../services/redis.js';
import { wrapSocketHandler } from './errorHandler.js';

/* ─── Types ─── */

interface SocketSubscription {
  socket: Socket;
  requestId: string;
}

interface TenantSubscription {
  sockets: Map<string, SocketSubscription>;
}

interface SubscribePayload {
  tenantId: string;
  requestId: string;
}

interface EmitContext {
  socket: Socket;
  socketId: string;
  tenantId: string;
}

/* ─── Shared subscription state ─── */

const tenantSubscriptions = new Map<string, TenantSubscription>();

/* ─── Redis subscription factory ─── */

function createRedisSubscription(tenantId: string): void {
  subscribe(tenantId, (msg: string) => {
    const sub = tenantSubscriptions.get(tenantId);
    if (sub === undefined) return;
    routeMessageToSockets(sub, msg, tenantId);
  });

  process.stdout.write(`[socket] Created shared Redis subscription for tenant: ${tenantId}\n`);
}

function routeMessageToSockets(sub: TenantSubscription, msg: string, tenantId: string): void {
  for (const [socketId, { socket, requestId }] of sub.sockets) {
    if (!socket.connected) continue;
    emitToSocket({ socket, socketId, tenantId }, msg, requestId);
  }
}

function emitToSocket(ctx: EmitContext, msg: string, requestId: string): void {
  try {
    ctx.socket.emit('message:new', { data: msg, requestId });
  } catch {
    process.stdout.write(`[socket] Failed to emit to socket ${ctx.socketId} on tenant ${ctx.tenantId}\n`);
  }
}

/* ─── Tenant subscription management ─── */

function getOrCreateTenantSubscription(tenantId: string): TenantSubscription {
  let subscription = tenantSubscriptions.get(tenantId);

  if (subscription === undefined) {
    subscription = { sockets: new Map() };
    tenantSubscriptions.set(tenantId, subscription);
    createRedisSubscription(tenantId);
  }

  return subscription;
}

function addSocketToTenant(tenantId: string, socket: Socket, requestId: string): void {
  const subscription = getOrCreateTenantSubscription(tenantId);
  subscription.sockets.delete(socket.id);
  subscription.sockets.set(socket.id, { socket, requestId });

  process.stdout.write(
    `[socket] Socket ${socket.id} subscribed to tenant ${tenantId} (total: ${String(subscription.sockets.size)})\n`
  );
}

function removeSocketFromAllTenants(socketId: string): void {
  for (const [tenantId, subscription] of tenantSubscriptions) {
    if (!subscription.sockets.has(socketId)) continue;

    subscription.sockets.delete(socketId);
    process.stdout.write(
      `[socket] Socket ${socketId} removed from tenant ${tenantId} (remaining: ${String(subscription.sockets.size)})\n`
    );
  }
}

/* ─── Subscription check ─── */

export function isSocketSubscribed(socketId: string): boolean {
  for (const subscription of tenantSubscriptions.values()) {
    if (subscription.sockets.has(socketId)) return true;
  }
  return false;
}

/* ─── Subscribe event handler ─── */

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidPayload(data: unknown): data is SubscribePayload {
  if (!isNonNullObject(data)) return false;
  return typeof data.tenantId === 'string' && data.tenantId !== '' && typeof data.requestId === 'string';
}

function handleSubscribeEvent(socket: Socket): (data: unknown) => void {
  return (data: unknown) => {
    if (!isValidPayload(data)) return;
    addSocketToTenant(data.tenantId, socket, data.requestId);
  };
}

/* ─── Initialize handlers ─── */

export function initializeSubscriptionHandlers(io: Server): void {
  io.on('connection', (socket) => {
    socket.on('messages:subscribe', wrapSocketHandler(handleSubscribeEvent(socket), socket, 'messages:subscribe'));

    socket.on('disconnect', () => {
      removeSocketFromAllTenants(socket.id);
    });
  });
}
