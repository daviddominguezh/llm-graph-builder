import type { WebCrawlInput, WebExtractInput, WebMapInput, WebSearchInput } from './schemas.js';

/**
 * Provider-neutral web tools contract. The swap-seam: any implementation of
 * this interface (Tavily today, our own infra later) is a drop-in. Each method
 * returns the upstream JSON verbatim.
 */
export interface WebSearchService {
  search: (input: WebSearchInput) => Promise<unknown>;
  extract: (input: WebExtractInput) => Promise<unknown>;
  crawl: (input: WebCrawlInput) => Promise<unknown>;
  map: (input: WebMapInput) => Promise<unknown>;
}

export interface WebProviderServices {
  service: WebSearchService;
}

export function isWebProviderServices(v: unknown): v is WebProviderServices {
  if (typeof v !== 'object' || v === null || !('service' in v)) return false;
  const { service } = v as { service: unknown };
  return (
    typeof service === 'object' &&
    service !== null &&
    'search' in service &&
    typeof (service as { search: unknown }).search === 'function'
  );
}
