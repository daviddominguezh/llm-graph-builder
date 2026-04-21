const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN ?? 'https://app.openflow.build';

export async function fetchLatestVersion(tenant: string, agent: string): Promise<number> {
  const res = await fetch(`${APP_ORIGIN}/api/chat/latest-version/${tenant}/${agent}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`latest-version failed: ${res.status}`);
  const data = (await res.json()) as { version: number };
  if (typeof data.version !== 'number') throw new Error('latest-version invalid shape');
  return data.version;
}
