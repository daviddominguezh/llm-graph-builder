// packages/widget/src/app/postMessageClient.ts
export type WidgetOutbound =
  | { type: 'openflow:ready'; nonce: string }
  | {
      type: 'openflow:resize';
      nonce: string;
      w: number | string;
      h: number | string;
      pos: 'bubble' | 'panel' | 'fullscreen';
    }
  | { type: 'openflow:telemetry'; nonce: string; event: string; data?: unknown };

export type HostInbound =
  | { type: 'openflow:init'; nonce: string; hostOrigin: string; path: string; viewportW: number }
  | { type: 'openflow:viewport'; nonce: string; viewportW: number };

let nonce: string | null = null;
let hostOrigin: string | null = null;
let viewportW: number | null = null;
let readyCallbacks: Array<(v: { viewportW: number }) => void> = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isHostMessage(data: unknown): data is HostInbound {
  if (!isRecord(data)) return false;
  return typeof data.type === 'string' && typeof data.nonce === 'string';
}

function onInit(
  msg: Extract<HostInbound, { type: 'openflow:init' }>,
  origin: string,
  onViewportChange: (w: number) => void
): void {
  if (nonce !== null) return;
  const { nonce: msgNonce, viewportW: msgViewportW } = msg;
  nonce = msgNonce;
  hostOrigin = origin;
  viewportW = msgViewportW;
  for (const cb of readyCallbacks) cb({ viewportW: msgViewportW });
  readyCallbacks = [];
  postReady();
  onViewportChange(msgViewportW);
}

function onViewport(
  msg: Extract<HostInbound, { type: 'openflow:viewport' }>,
  onViewportChange: (w: number) => void
): void {
  const { viewportW: msgViewportW } = msg;
  viewportW = msgViewportW;
  onViewportChange(msgViewportW);
}

export function initMessageBridge(onViewportChange: (w: number) => void): void {
  window.addEventListener('message', (e: MessageEvent<unknown>) => {
    if (!isHostMessage(e.data)) return;
    const { data } = e;
    if (data.type === 'openflow:init') {
      onInit(data, e.origin, onViewportChange);
      return;
    }
    if (e.origin !== hostOrigin || data.nonce !== nonce) return;
    onViewport(data, onViewportChange);
  });
}

export async function awaitInit(): Promise<{ viewportW: number }> {
  if (nonce !== null && viewportW !== null) return await Promise.resolve({ viewportW });
  const { promise, resolve } = Promise.withResolvers<{ viewportW: number }>();
  readyCallbacks.push(resolve);
  return await promise;
}

export function getHostOrigin(): string | null {
  return hostOrigin;
}

function postReady(): void {
  if (nonce === null || hostOrigin === null) return;
  window.parent.postMessage({ type: 'openflow:ready', nonce }, hostOrigin);
}

export function postResize(pos: 'bubble' | 'panel' | 'fullscreen'): void {
  if (nonce === null || hostOrigin === null) return;
  const dims = resizeDims(pos);
  window.parent.postMessage({ type: 'openflow:resize', nonce, pos, ...dims }, hostOrigin);
}

const BUBBLE_SIZE = 56;
const PANEL_WIDTH = 400;

function resizeDims(pos: 'bubble' | 'panel' | 'fullscreen'): { w: number | string; h: number | string } {
  if (pos === 'bubble') return { w: BUBBLE_SIZE, h: BUBBLE_SIZE };
  if (pos === 'fullscreen') return { w: '100vw', h: '100vh' };
  return { w: PANEL_WIDTH, h: '100vh' };
}

export function postTelemetry(event: string, data?: unknown): void {
  if (nonce === null || hostOrigin === null) return;
  window.parent.postMessage({ type: 'openflow:telemetry', nonce, event, data }, hostOrigin);
}
