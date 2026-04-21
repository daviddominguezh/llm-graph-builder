const MAX_ASCII_CODE = 0x7f;
const FIRST_CHAR_INDEX = 0;
const HOST_REGEX =
  /^(?<tenant>[a-z0-9]{1,40})-(?<agentSlug>[a-z0-9]+(?:-[a-z0-9]+)*)\.live\.openflow\.build$/v;
const PORT_SUFFIX = /:\d+$/v;
const TRAILING_DOT = /\.$/v;

function isAscii(s: string): boolean {
  for (const ch of s) {
    if (ch.charCodeAt(FIRST_CHAR_INDEX) > MAX_ASCII_CODE) return false;
  }
  return true;
}

export function parseAgentHost(raw: string): { tenant: string; agentSlug: string } | null {
  const host = raw.toLowerCase().replace(PORT_SUFFIX, '').replace(TRAILING_DOT, '');
  if (!isAscii(host)) return null;
  const m = HOST_REGEX.exec(host);
  if (m === null) return null;
  const { tenant, agentSlug } = m.groups ?? {};
  if (tenant === undefined || agentSlug === undefined) return null;
  return { tenant, agentSlug };
}
