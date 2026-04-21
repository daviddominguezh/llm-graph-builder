import { parseAgentHost } from '../routing/parseHostname.js';

interface GlobalAPI {
  boot: () => void;
  debug: () => Record<string, unknown>;
  version: string;
}

declare global {
  interface Window {
    OpenFlowWidget?: GlobalAPI;
  }
}

const LOADER_VERSION = '0.1.0';

// These constants are used by the boot implementation filled in Tasks 45–48.
export const APP_ORIGIN_DEFAULT = 'https://app.openflow.build';
export const CSP_TIMEOUT_MS = 8000;
export const HANDSHAKE_INTERVAL_MS = 200;
export const VIEWPORT_DEBOUNCE_MS = 100;
export const IFRAME_Z = 2147483647;

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

// Stubs to be filled in Tasks 45–48.
function boot(
  _el: HTMLScriptElement,
  _host: string,
  _sub: { tenant: string; agentSlug: string },
  _v: string | undefined
): void {
  debugState.bootCalled = true;
  // implemented in Task 45+
}

init();
