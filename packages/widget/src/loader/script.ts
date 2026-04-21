import { parseAgentHost } from '../routing/parseHostname.js';
import { startHandshake, type IframePos } from './handshake.js';

export { CSP_TIMEOUT_MS, HANDSHAKE_INTERVAL_MS } from './handshake.js';

interface GlobalAPI {
  boot: () => void;
  debug: () => Record<string, unknown>;
  version: string;
}

interface VersionResponse {
  version: number;
}

declare global {
  interface Window {
    OpenFlowWidget?: GlobalAPI;
    OPENFLOW_APP_ORIGIN?: string;
  }
}

const LOADER_VERSION = '0.1.0';

export const APP_ORIGIN_DEFAULT = 'https://app.openflow.build';
export const VIEWPORT_DEBOUNCE_MS = 100;
export const IFRAME_Z = 2147483647;

// Iframe position constants (pixels)
const BUBBLE_BOTTOM_PX = 16;
const BUBBLE_RIGHT_PX = 16;
const BUBBLE_SIZE_PX = 56;
const PANEL_TOP_PX = 24;
const PANEL_RIGHT_PX = 14;
const PANEL_BOTTOM_PX = 24;
const PANEL_WIDTH_PX = 400;

const debugState: Record<string, unknown> = {
  version: LOADER_VERSION,
  bootCalled: false,
};

function isSelfScript(src: string): boolean {
  return src.includes('live.openflow.build/script.js');
}

function resolveScriptElement(): HTMLScriptElement | null {
  const { currentScript } = document;
  if (currentScript instanceof HTMLScriptElement) return currentScript;
  const scripts = Array.from(document.getElementsByTagName('script'));
  return scripts.reverse().find((s) => isSelfScript(s.src)) ?? null;
}

function buildGlobalAPI(
  scriptEl: HTMLScriptElement,
  host: string,
  sub: { tenant: string; agentSlug: string },
  explicitVersion: string | undefined
): GlobalAPI {
  return {
    boot: () => {
      boot(scriptEl, host, sub, explicitVersion);
    },
    debug: () => ({ ...debugState }),
    version: LOADER_VERSION,
  };
}

function applyDebugState(
  host: string,
  sub: { tenant: string; agentSlug: string },
  autoload: boolean,
  explicitVersion: string | undefined
): void {
  Object.assign(debugState, {
    host,
    tenant: sub.tenant,
    agent: sub.agentSlug,
    autoload,
    explicitVersion: explicitVersion ?? null,
  });
}

function init(): void {
  const scriptEl = resolveScriptElement();
  if (scriptEl === null) {
    globalThis.console.warn('OpenFlowWidget: could not resolve its own <script> tag');
    return;
  }

  const url = new URL(scriptEl.src);
  const sub = parseAgentHost(url.host);
  if (sub === null) {
    globalThis.console.warn('OpenFlowWidget: invalid script host', url.host);
    return;
  }

  const { dataset } = scriptEl;
  const { version: explicitVersion, autoload: autoloadAttr } = dataset;
  const autoload = autoloadAttr !== 'false';

  applyDebugState(url.host, sub, autoload, explicitVersion);
  window.OpenFlowWidget = buildGlobalAPI(scriptEl, url.host, sub, explicitVersion);
  globalThis.console.info(`OpenFlowWidget v${LOADER_VERSION} loaded for ${url.host}`);

  if (autoload) boot(scriptEl, url.host, sub, explicitVersion);
}

function isVersionResponse(val: unknown): val is VersionResponse {
  return (
    typeof val === 'object' &&
    val !== null &&
    'version' in val &&
    typeof (val as Record<string, unknown>).version === 'number'
  );
}

async function fetchVersion(appOrigin: string, sub: { tenant: string; agentSlug: string }): Promise<string | null> {
  try {
    const res = await fetch(`${appOrigin}/api/chat/latest-version/${sub.tenant}/${sub.agentSlug}`, {
      cache: 'no-store',
    });
    const raw: unknown = await res.json();
    if (!isVersionResponse(raw)) {
      globalThis.console.warn('OpenFlowWidget: unexpected version response');
      return null;
    }
    return String(raw.version);
  } catch (e) {
    globalThis.console.warn('OpenFlowWidget: failed to resolve latest version', e);
    return null;
  }
}

async function resolveVersion(
  explicitVersion: string | undefined,
  appOrigin: string,
  sub: { tenant: string; agentSlug: string }
): Promise<string | null> {
  if (explicitVersion !== undefined && /^\d{1,6}$/v.test(explicitVersion)) {
    return explicitVersion;
  }
  return await fetchVersion(appOrigin, sub);
}

function buildBubbleStyle(base: string): string {
  return [
    base,
    `bottom:${String(BUBBLE_BOTTOM_PX)}px`,
    `right:${String(BUBBLE_RIGHT_PX)}px`,
    `width:${String(BUBBLE_SIZE_PX)}px`,
    `height:${String(BUBBLE_SIZE_PX)}px`,
  ].join(';');
}

function buildPanelStyle(base: string): string {
  return [
    base,
    `top:${String(PANEL_TOP_PX)}px`,
    `right:${String(PANEL_RIGHT_PX)}px`,
    `bottom:${String(PANEL_BOTTOM_PX)}px`,
    `width:${String(PANEL_WIDTH_PX)}px`,
  ].join(';');
}

export function buildIframeStyle(pos: IframePos): string {
  const base = `border:0;position:fixed;z-index:${String(IFRAME_Z)};color-scheme:normal`;
  if (pos === 'bubble') return buildBubbleStyle(base);
  if (pos === 'fullscreen') return `${base};top:0;left:0;right:0;bottom:0;width:100vw;height:100vh`;
  return buildPanelStyle(base);
}

function createIframe(host: string, version: string): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  iframe.src = `https://${host}/v/${version}`;
  iframe.title = 'OpenFlow chat widget';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.loading = 'eager';
  iframe.style.cssText = buildIframeStyle('bubble');
  return iframe;
}

// Task 47 will fill these.
function wireViewportForwarding(_iframe: HTMLIFrameElement, _nonce: string, _iframeOrigin: string): void {
  // noop for now
}
function wireTeardown(_iframe: HTMLIFrameElement, _onMessage: (e: MessageEvent) => void): void {
  // noop for now
}

function bootHandshake(iframe: HTMLIFrameElement): void {
  startHandshake(iframe, {
    buildIframeStyle,
    onReady: () => {
      debugState.ready = true;
    },
    onTelemetry: (data) => {
      debugState.lastTelemetry = data;
    },
    wireViewportForwarding,
    wireTeardown,
  });
}

function boot(
  _el: HTMLScriptElement,
  host: string,
  sub: { tenant: string; agentSlug: string },
  explicitVersion: string | undefined
): void {
  debugState.bootCalled = true;
  const { OPENFLOW_APP_ORIGIN } = window;
  const appOrigin = OPENFLOW_APP_ORIGIN ?? APP_ORIGIN_DEFAULT;

  void (async () => {
    const version = await resolveVersion(explicitVersion, appOrigin, sub);
    if (version === null) return;

    debugState.version = version;
    const iframe = createIframe(host, version);
    document.body.appendChild(iframe);
    const { src } = iframe;
    debugState.iframeUrl = src;

    bootHandshake(iframe);
  })();
}

init();
