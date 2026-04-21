const HOST_REGEX = /^([a-z0-9]{1,40})-([a-z0-9]+(?:-[a-z0-9]+)*)\.live\.openflow\.build$/;

export function parseAgentHost(raw: string): { tenant: string; agentSlug: string } | null {
  const host = raw
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
  if (!/^[\x00-\x7f]+$/.test(host)) return null;
  const m = host.match(HOST_REGEX);
  if (!m) return null;
  const tenant = m[1];
  const agentSlug = m[2];
  if (tenant === undefined || agentSlug === undefined) return null;
  return { tenant, agentSlug };
}
