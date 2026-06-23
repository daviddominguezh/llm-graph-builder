// Deno-side WebSearchService factory. Reads the Tavily key from the
// environment (a Supabase secret) and builds the provider-neutral
// WebSearchService backed by Tavily's REST API. Returns undefined when no
// key is configured, so the web tools simply do not materialize.
import type { WebProviderServices } from '@daviddh/llm-graph-runner';
import { makeTavilyWebService } from '@daviddh/llm-graph-runner';

const DEFAULT_BASE_URL = 'https://api.tavily.com';

export function makeWebService(): WebProviderServices | undefined {
  const apiKey = Deno.env.get('TAVILY_API_KEY') ?? '';
  if (apiKey === '') return undefined;
  const baseUrl = Deno.env.get('TAVILY_API_BASE_URL') ?? DEFAULT_BASE_URL;
  return { service: makeTavilyWebService({ apiKey, baseUrl, fetchImpl: fetch }) };
}
