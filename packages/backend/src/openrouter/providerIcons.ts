import type { ProviderIcon } from './modelCache.js';

const OPENROUTER_FRONTEND_URL = 'https://openrouter.ai/api/frontend/models';
const OPENROUTER_BASE = 'https://openrouter.ai';

interface FrontendIcon {
  url?: string;
  className?: string;
}

interface FrontendModel {
  slug?: string;
  author?: string;
  endpoint?: {
    provider_info?: { icon?: FrontendIcon };
  };
}

function hasDataArray(json: unknown): json is { data: FrontendModel[] } {
  if (typeof json !== 'object' || json === null) return false;
  return 'data' in json && Array.isArray((json as { data: unknown }).data);
}

function parseFrontendResponse(json: unknown): FrontendModel[] {
  return hasDataArray(json) ? json.data : [];
}

function resolveIconUrl(url: string): string {
  return url.startsWith('/') ? `${OPENROUTER_BASE}${url}` : url;
}

function extractIconEntry(icon: FrontendIcon): ProviderIcon | null {
  const { url, className } = icon;
  if (typeof url !== 'string' || url === '') return null;
  const entry: ProviderIcon = { url: resolveIconUrl(url) };
  if (typeof className === 'string' && className !== '') {
    entry.className = className;
  }
  return entry;
}

function getAuthor(m: FrontendModel): string | undefined {
  if (typeof m.author === 'string' && m.author !== '') return m.author;
  const slug = m.slug ?? '';
  const [firstSegment = ''] = slug.split('/');
  return firstSegment === '' ? undefined : firstSegment;
}

function buildIconMap(models: FrontendModel[]): Map<string, ProviderIcon> {
  const map = new Map<string, ProviderIcon>();
  for (const m of models) {
    const icon = m.endpoint?.provider_info?.icon;
    if (icon === undefined) continue;
    const entry = extractIconEntry(icon);
    if (entry === null) continue;
    const author = getAuthor(m);
    if (author === undefined || map.has(author)) continue;
    map.set(author, entry);
  }
  return map;
}

export async function fetchProviderIcons(): Promise<Map<string, ProviderIcon>> {
  try {
    const res = await fetch(OPENROUTER_FRONTEND_URL);
    if (!res.ok) return new Map();
    const json: unknown = await res.json();
    const body = parseFrontendResponse(json);
    return buildIconMap(body);
  } catch {
    return new Map();
  }
}
