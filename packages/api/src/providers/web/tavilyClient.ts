import { ToolError } from '../types.js';
import type { WebSearchService } from './types.js';

export interface TavilyHttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

export type TavilyFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<TavilyHttpResponse>;

export interface TavilyConfig {
  apiKey: string;
  baseUrl: string;
  fetchImpl: TavilyFetch;
}

const ERROR_BODY_START = 0;
const ERROR_BODY_MAX = 300;

async function callTavily(cfg: TavilyConfig, endpoint: string, args: object): Promise<unknown> {
  const res = await cfg.fetchImpl(`${cfg.baseUrl}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    // include_usage is ALWAYS set so every response carries cost/usage data.
    body: JSON.stringify({ ...args, include_usage: true }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ToolError(
      'upstream_error',
      `web ${endpoint} failed: HTTP ${String(res.status)} ${detail.slice(ERROR_BODY_START, ERROR_BODY_MAX)}`
    );
  }
  return await res.json();
}

export function makeTavilyWebService(cfg: TavilyConfig): WebSearchService {
  return {
    search: async (input) => await callTavily(cfg, 'search', input),
    extract: async (input) => await callTavily(cfg, 'extract', input),
    crawl: async (input) => await callTavily(cfg, 'crawl', input),
    map: async (input) => await callTavily(cfg, 'map', input),
  };
}
