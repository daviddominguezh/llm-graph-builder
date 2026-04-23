const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://app.openflow.build';

export interface TenantDisplay {
  name: string;
  avatarUrl: string | null;
}

export interface AgentDisplay {
  name: string;
}

export interface LatestVersionResponse {
  version: number;
  allowedOrigins: string[];
  webChannelEnabled: boolean;
  tenant: TenantDisplay;
  agent: AgentDisplay;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTenantDisplay(value: unknown): value is TenantDisplay {
  if (!isRecord(value)) return false;
  if (typeof value.name !== 'string') return false;
  const { avatarUrl } = value;
  return avatarUrl === null || typeof avatarUrl === 'string';
}

function isAgentDisplay(value: unknown): value is AgentDisplay {
  return isRecord(value) && typeof value.name === 'string';
}

function isVersionResponse(value: unknown): value is LatestVersionResponse {
  if (!isRecord(value)) return false;
  const { version, allowedOrigins, webChannelEnabled, tenant, agent } = value;
  if (typeof version !== 'number') return false;
  if (!isStringArray(allowedOrigins)) return false;
  if (typeof webChannelEnabled !== 'boolean') return false;
  if (!isTenantDisplay(tenant)) return false;
  if (!isAgentDisplay(agent)) return false;
  return true;
}

export async function fetchLatestVersion(tenant: string, agent: string): Promise<LatestVersionResponse> {
  const res = await fetch(`${APP_ORIGIN}/api/chat/latest-version/${tenant}/${agent}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`latest-version failed: ${String(res.status)}`);
  const data: unknown = await res.json();
  if (!isVersionResponse(data)) throw new Error('latest-version invalid shape');
  return data;
}
