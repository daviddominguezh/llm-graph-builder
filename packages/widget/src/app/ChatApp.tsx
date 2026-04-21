import { useEffect, useState } from 'react';

import { fetchLatestVersion } from '../api/latestVersionClient.js';
import { pickLocale, type Locale } from '../i18n/index.js';
import { parseAgentHost } from '../routing/parseHostname.js';
import { I18nProvider } from './i18nContext.js';
import { EmbeddedMode } from './modes/EmbeddedMode.js';
import { StandaloneMode } from './modes/StandaloneMode.js';
import { awaitInit, initMessageBridge } from './postMessageClient.js';
import { isEmbedded } from './useEmbedded.js';

interface Resolved {
  tenant: string;
  agentSlug: string;
  version: number;
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
  const versionOrLatest = parseVersionPath();
  const version =
    versionOrLatest === 'latest'
      ? await fetchLatestVersion(host.tenant, host.agentSlug)
      : versionOrLatest;
  return { ...host, version };
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

export function ChatApp() {
  const embedded = isEmbedded();
  const { resolved, viewportW, error } = useAgentResolver(embedded);

  const queryLang = new URLSearchParams(window.location.search).get('lang');
  const locale: Locale = pickLocale(queryLang, navigator.language);

  if (error === 'not_found') {
    return <div className="p-8 text-center">Agent not found</div>;
  }
  if (resolved === null) {
    return <div className="p-8 text-center">Initializing…</div>;
  }

  return (
    <I18nProvider locale={locale}>
      {embedded ? <EmbeddedMode hostViewportW={viewportW} /> : <StandaloneMode />}
    </I18nProvider>
  );
}
