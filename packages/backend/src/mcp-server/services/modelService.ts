import type { CachedModel } from '../../openrouter/modelCache.js';
import { getCachedModels } from '../../openrouter/modelCache.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  maxCompletionTokens: number | null;
}

/* ------------------------------------------------------------------ */
/*  Service function                                                   */
/* ------------------------------------------------------------------ */

function toModelInfo(model: CachedModel): ModelInfo {
  return {
    id: model.id,
    name: model.name,
    contextLength: model.contextLength,
    maxCompletionTokens: model.maxCompletionTokens,
  };
}

export function listAvailableModels(): ModelInfo[] {
  return getCachedModels().map(toModelInfo);
}
