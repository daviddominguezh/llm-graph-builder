import { z } from 'zod';

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

export interface CachedModel {
  id: string;
  name: string;
  pricing: z.infer<typeof PricingSchema>;
  contextLength: number;
  maxCompletionTokens: number | null;
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

let cachedModels: CachedModel[] = [];

function mapModel(model: OpenRouterModel): CachedModel {
  return {
    id: model.id,
    name: model.name,
    pricing: model.pricing,
    contextLength: model.context_length,
    maxCompletionTokens: model.top_provider.max_completion_tokens,
  };
}

export async function fetchAndCacheModels(): Promise<void> {
  try {
    const res = await fetch(OPENROUTER_MODELS_URL);
    if (!res.ok) {
      throw new Error(`OpenRouter responded with ${String(res.status)}`);
    }
    const json: unknown = await res.json();
    const body = OpenRouterResponseSchema.parse(json);
    cachedModels = body.data.map(mapModel);
    process.stdout.write(`[openrouter] Cached ${String(cachedModels.length)} models\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    process.stderr.write(`[openrouter] Failed to fetch models: ${msg}\n`);
  }
}

export function getCachedModels(): CachedModel[] {
  return cachedModels;
}
