import type { Request, Response } from 'express';

import { HTTP_NOT_FOUND, HTTP_OK } from '../routeHelpers.js';

const MOCK_AGENT_SLUG = 'agent-example';
const MOCK_AGENT_VERSION = 5;

export function handleMockLatestVersion(req: Request<{ agentSlug: string }>, res: Response): void {
  if (req.params.agentSlug !== MOCK_AGENT_SLUG) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Mock agent not found' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(HTTP_OK).json({ version: MOCK_AGENT_VERSION });
}
