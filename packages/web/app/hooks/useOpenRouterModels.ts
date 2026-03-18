import { useEffect, useState } from 'react';
import { z } from 'zod';

const PricingSchema = z.object({
  prompt: z.string(),
  completion: z.string(),
  image: z.string().optional(),
  request: z.string().optional(),
});

const ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  pricing: PricingSchema,
  contextLength: z.number(),
  maxCompletionTokens: z.number().nullable(),
});

const ResponseSchema = z.object({ models: z.array(ModelSchema) });

export type OpenRouterModel = z.infer<typeof ModelSchema>;

let cached: OpenRouterModel[] | null = null;
let pending: Promise<OpenRouterModel[]> | null = null;

async function fetchModelsFromApi(): Promise<OpenRouterModel[]> {
  const res = await fetch('/api/openrouter/models');
  const json: unknown = await res.json();
  const parsed = ResponseSchema.parse(json);
  cached = parsed.models;
  return parsed.models;
}

function fetchModels(): Promise<OpenRouterModel[]> {
  if (cached !== null) return Promise.resolve(cached);
  if (pending !== null) return pending;
  pending = fetchModelsFromApi().catch(() => {
    cached = [];
    return [];
  });
  return pending;
}

export function useOpenRouterModels(): OpenRouterModel[] {
  const [models, setModels] = useState<OpenRouterModel[]>(cached ?? []);

  useEffect(() => {
    void fetchModels().then(setModels);
  }, []);

  return models;
}
