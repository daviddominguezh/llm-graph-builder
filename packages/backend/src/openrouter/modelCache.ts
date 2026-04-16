import { z } from 'zod';

import { fetchProviderIcons } from './providerIcons.js';

const PricingSchema = z.object({
  prompt: z.string(),
  completion: z.string(),
  image: z.string().optional(),
  request: z.string().optional(),
});

const OpenRouterModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  pricing: PricingSchema,
  context_length: z.number(),
  top_provider: z.object({ max_completion_tokens: z.number().nullable() }),
});

const OpenRouterResponseSchema = z.object({
  data: z.array(OpenRouterModelSchema),
});

type OpenRouterModel = z.infer<typeof OpenRouterModelSchema>;

export interface ProviderIcon {
  url: string;
  className?: string;
}

export interface CachedModel {
  id: string;
  name: string;
  pricing: z.infer<typeof PricingSchema>;
  contextLength: number;
  maxCompletionTokens: number | null;
  providerIcon?: ProviderIcon;
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

let cachedModels: CachedModel[] = [];

function extractProvider(modelId: string): string {
  const [first = modelId] = modelId.split('/');
  return first;
}

function mapModel(model: OpenRouterModel, iconMap: Map<string, ProviderIcon>): CachedModel {
  const provider = extractProvider(model.id);
  const icon = iconMap.get(provider);
  return {
    id: model.id,
    name: model.name,
    pricing: model.pricing,
    contextLength: model.context_length,
    maxCompletionTokens: model.top_provider.max_completion_tokens,
    ...(icon === undefined ? {} : { providerIcon: icon }),
  };
}

export async function fetchAndCacheModels(): Promise<void> {
  try {
    const [modelsRes, iconMap] = await Promise.all([fetch(OPENROUTER_MODELS_URL), fetchProviderIcons()]);
    if (!modelsRes.ok) {
      throw new Error(`OpenRouter responded with ${String(modelsRes.status)}`);
    }
    const json: unknown = await modelsRes.json();
    const body = OpenRouterResponseSchema.parse(json);
    cachedModels = body.data.map((m) => mapModel(m, iconMap));
    process.stdout.write(`[openrouter] Cached ${String(cachedModels.length)} models\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stderr.write(`[openrouter] Failed to fetch models: ${msg}\n`);
  }
}

export function getCachedModels(): CachedModel[] {
  return cachedModels;
}
