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

export function isHostMessage(data: unknown): data is HostInbound {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as Record<string, unknown>).type === 'string' &&
    typeof (data as Record<string, unknown>).nonce === 'string'
  );
}

function onInit(e: MessageEvent, onViewportChange: (w: number) => void): void {
  if (e.data.type !== 'openflow:init') return;
  if (nonce !== null) return;
  nonce = e.data.nonce;
  hostOrigin = e.origin;
  viewportW = e.data.viewportW;
  for (const cb of readyCallbacks) cb({ viewportW: e.data.viewportW });
  readyCallbacks = [];
  postReady();
  onViewportChange(e.data.viewportW);
}

function onViewport(e: MessageEvent, onViewportChange: (w: number) => void): void {
  if (e.data.type !== 'openflow:viewport') return;
  viewportW = e.data.viewportW;
  onViewportChange(e.data.viewportW);
}

export function initMessageBridge(onViewportChange: (w: number) => void): void {
  window.addEventListener('message', (e) => {
    if (!isHostMessage(e.data)) return;
    if (e.data.type === 'openflow:init') {
      onInit(e, onViewportChange);
      return;
    }
    if (e.origin !== hostOrigin || e.data.nonce !== nonce) return;
    onViewport(e, onViewportChange);
  });
}

export function awaitInit(): Promise<{ viewportW: number }> {
  if (nonce !== null && viewportW !== null) return Promise.resolve({ viewportW });
  return new Promise((r) => readyCallbacks.push(r));
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
