const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://app.openflow.build';

export interface LatestVersionResponse {
  version: number;
  allowedOrigins: string[];
  webChannelEnabled: boolean;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVersionResponse(value: unknown): value is LatestVersionResponse {
  if (!isRecord(value)) return false;
  const { version, allowedOrigins, webChannelEnabled } = value;
  if (typeof version !== 'number') return false;
  if (!isStringArray(allowedOrigins)) return false;
  if (typeof webChannelEnabled !== 'boolean') return false;
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
