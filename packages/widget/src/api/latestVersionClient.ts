const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://app.openflow.build';

function isVersionResponse(value: unknown): value is { version: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof (value as { version: unknown }).version === 'number'
  );
}

export async function fetchLatestVersion(tenant: string, agent: string): Promise<number> {
  const res = await fetch(`${APP_ORIGIN}/api/chat/latest-version/${tenant}/${agent}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`latest-version failed: ${res.status}`);
  const data: unknown = await res.json();
  if (!isVersionResponse(data)) throw new Error('latest-version invalid shape');
  return data.version;
}
