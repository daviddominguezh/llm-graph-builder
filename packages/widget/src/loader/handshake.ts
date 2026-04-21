import { randomUUID } from '../lib/uuid.js';

export const CSP_TIMEOUT_MS = 8000;
export const HANDSHAKE_INTERVAL_MS = 200;

export type IframePos = 'bubble' | 'panel' | 'fullscreen';

export interface ResizeMsg {
  pos: string;
  w: number | string;
  h: number | string;
}

interface InitMsg {
  type: string;
  nonce: string;
  hostOrigin: string;
  path: string;
  viewportW: number;
}

interface IncomingMsg {
  type: string;
  nonce: string;
  [key: string]: unknown;
}

function hasStringProp(data: unknown, key: string): boolean {
  return typeof data === 'object' && data !== null && typeof Reflect.get(data, key) === 'string';
}

function isIncomingMsg(data: unknown): data is IncomingMsg {
  return hasStringProp(data, 'type') && hasStringProp(data, 'nonce');
}

function isResizeMsg(data: IncomingMsg): data is IncomingMsg & ResizeMsg {
  return typeof data.pos === 'string' && (typeof data.w === 'number' || typeof data.w === 'string');
}

function buildInitMsg(nonce: string): InitMsg {
  return {
    type: 'openflow:init',
    nonce,
    hostOrigin: window.location.origin,
    path: window.location.pathname,
    viewportW: window.innerWidth,
  };
}

function postInitMsg(iframe: HTMLIFrameElement, nonce: string, iframeOrigin: string): void {
  if (iframe.contentWindow === null) return;
  iframe.contentWindow.postMessage(buildInitMsg(nonce), iframeOrigin);
}

function resolvePos(raw: string): IframePos {
  if (raw === 'panel' || raw === 'fullscreen') return raw;
  return 'bubble';
}

export function applyIframeResize(
  iframe: HTMLIFrameElement,
  msg: ResizeMsg,
  buildStyle: (pos: IframePos) => string
): void {
  iframe.setAttribute('style', buildStyle(resolvePos(msg.pos)));
}

export function startRetryLoop(
  iframe: HTMLIFrameElement,
  nonce: string,
  iframeOrigin: string,
  isReady: () => boolean
): ReturnType<typeof setInterval> {
  const timer = setInterval(() => {
    if (isReady() || !iframe.isConnected) {
      clearInterval(timer);
      return;
    }
    postInitMsg(iframe, nonce, iframeOrigin);
  }, HANDSHAKE_INTERVAL_MS);
  return timer;
}

export function startCspTimeout(
  iframeOrigin: string,
  retryTimer: ReturnType<typeof setInterval>,
  isReady: () => boolean
): void {
  setTimeout(() => {
    if (isReady()) return;
    clearInterval(retryTimer);
    globalThis.console.warn(
      `OpenFlowWidget: iframe did not respond within ${String(CSP_TIMEOUT_MS)}ms. ` +
        `Check Content-Security-Policy: frame-src ${iframeOrigin}; ` +
        `script-src ${iframeOrigin}; ` +
        `connect-src https://app.openflow.build`
    );
  }, CSP_TIMEOUT_MS);
}

export interface HandshakeCallbacks {
  buildIframeStyle: (pos: IframePos) => string;
  onTelemetry: (data: Record<string, unknown>) => void;
  wireViewportForwarding: (iframe: HTMLIFrameElement, nonce: string, iframeOrigin: string) => void;
  wireTeardown: (iframe: HTMLIFrameElement, onMessage: (e: MessageEvent) => void) => void;
  onReady: () => void;
}

interface MsgHandlerCtx {
  iframe: HTMLIFrameElement;
  nonce: string;
  iframeOrigin: string;
  markReady: () => void;
  cb: HandshakeCallbacks;
}

function createMsgHandler(ctx: MsgHandlerCtx): (e: MessageEvent) => void {
  const { iframe, nonce, iframeOrigin, markReady, cb } = ctx;
  return function onMessage(e: MessageEvent<unknown>): void {
    if (e.origin !== iframeOrigin) return;
    const { data } = e;
    if (!isIncomingMsg(data)) return;
    const msg = data;
    if (msg.nonce !== nonce) return;
    if (msg.type === 'openflow:ready') {
      markReady();
    } else if (msg.type === 'openflow:telemetry') {
      cb.onTelemetry(msg);
    } else if (msg.type === 'openflow:resize' && isResizeMsg(msg)) {
      applyIframeResize(iframe, msg, cb.buildIframeStyle);
    }
  };
}

export function startHandshake(iframe: HTMLIFrameElement, cb: HandshakeCallbacks): void {
  const nonce = randomUUID();
  const { src } = iframe;
  const { origin: iframeOrigin } = new URL(src);
  let readyReceived = false;

  function markReady(): void {
    readyReceived = true;
    cb.onReady();
  }

  const onMessage = createMsgHandler({ iframe, nonce, iframeOrigin, markReady, cb });
  window.addEventListener('message', onMessage);

  postInitMsg(iframe, nonce, iframeOrigin);

  const retryTimer = startRetryLoop(iframe, nonce, iframeOrigin, () => readyReceived);
  startCspTimeout(iframeOrigin, retryTimer, () => readyReceived);

  cb.wireViewportForwarding(iframe, nonce, iframeOrigin);
  cb.wireTeardown(iframe, onMessage);
}
