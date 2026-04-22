import { matchOrigin } from '@openflow/shared-validation';
import { useEffect, useState } from 'react';

import { fetchLatestVersion } from '../api/latestVersionClient.js';
import { type Locale, pickLocale } from '../i18n/index.js';
import { parseAgentHost } from '../routing/parseHostname.js';
import { BlockedState } from './BlockedState.js';
import { AgentNotFoundState, LoadingState } from './LoadingState.js';
import { AgentProvider } from './agentContext.js';
import { I18nProvider } from './i18nContext.js';
import { EmbeddedMode } from './modes/EmbeddedMode.js';
import { StandaloneMode } from './modes/StandaloneMode.js';
import { awaitInit, getHostOrigin, initMessageBridge } from './postMessageClient.js';
import { isEmbedded } from './useEmbedded.js';

interface Resolved {
  tenant: string;
  agentSlug: string;
  version: number;
  allowedOrigins: string[];
  webChannelEnabled: boolean;
}

interface AgentResolverState {
  resolved: Resolved | null;
  viewportW: number | null;
  error: string | null;
}

function parseDevOverride(): { tenant: string; agentSlug: string } | null {
  const params = new URLSearchParams(window.location.search);
  const t = params.get('tenant');
  const a = params.get('agent');
  if (t !== null && a !== null) return { tenant: t, agentSlug: a };
  return null;
}

const VERSION_PATH_REGEX = /^\/v\/(\d{1,6})$/u;

function parseVersionPath(): number | 'latest' {
  const m = window.location.pathname.match(VERSION_PATH_REGEX);
  if (m !== null) return Number(m[1]);
  return 'latest';
}

async function resolveAgent(): Promise<Resolved> {
  const host = parseDevOverride() ?? parseAgentHost(window.location.hostname);
  if (host === null) throw new Error('not_found');
  const versionInfo = await fetchLatestVersion(host.tenant, host.agentSlug);
  const versionOrLatest = parseVersionPath();
  const version = versionOrLatest === 'latest' ? versionInfo.version : versionOrLatest;
  return {
    ...host,
    version,
    allowedOrigins: versionInfo.allowedOrigins,
    webChannelEnabled: versionInfo.webChannelEnabled,
  };
}

function useAgentResolver(embedded: boolean): AgentResolverState {
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [viewportW, setViewportW] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!embedded) return;
    initMessageBridge((w) => setViewportW(w));
    void awaitInit().then(({ viewportW: w }) => setViewportW(w));
  }, [embedded]);

  useEffect(() => {
    void resolveAgent()
      .then(setResolved)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'init_failed';
        setError(msg);
      });
  }, []);

  return { resolved, viewportW, error };
}

function effectiveHostOrigin(embedded: boolean): string | null {
  if (embedded) return getHostOrigin();
  return window.location.origin;
}

function isAllowedToRender(embedded: boolean, resolved: Resolved): boolean {
  if (!resolved.webChannelEnabled) return false;
  const origin = effectiveHostOrigin(embedded);
  if (origin === null) return false;
  return matchOrigin(origin, resolved.allowedOrigins);
}

interface ChatAppBodyProps {
  embedded: boolean;
  resolved: Resolved | null;
  viewportW: number | null;
  error: string | null;
}

function ChatAppBody({ embedded, resolved, viewportW, error }: ChatAppBodyProps) {
  if (error === 'not_found') return <AgentNotFoundState />;
  if (resolved === null) return <LoadingState embedded={embedded} />;
  if (!isAllowedToRender(embedded, resolved)) return <BlockedState />;
  const ctx = { tenant: resolved.tenant, agentSlug: resolved.agentSlug, version: resolved.version };
  return (
    <AgentProvider value={ctx}>
      {embedded ? <EmbeddedMode hostViewportW={viewportW} /> : <StandaloneMode />}
    </AgentProvider>
  );
}

export function ChatApp() {
  const embedded = isEmbedded();
  const { resolved, viewportW, error } = useAgentResolver(embedded);

  const queryLang = new URLSearchParams(window.location.search).get('lang');
  const locale: Locale = pickLocale(queryLang, navigator.language);

  return (
    <I18nProvider locale={locale}>
      <ChatAppBody embedded={embedded} resolved={resolved} viewportW={viewportW} error={error} />
    </I18nProvider>
  );
}
