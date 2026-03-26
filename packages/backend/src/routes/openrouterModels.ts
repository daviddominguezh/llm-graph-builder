import type { Request, Response } from 'express';

import { getCachedModels } from '../openrouter/modelCache.js';

export function handleGetOpenRouterModels(_req: Request, res: Response): void {
  res.json({ models: getCachedModels() });
}
