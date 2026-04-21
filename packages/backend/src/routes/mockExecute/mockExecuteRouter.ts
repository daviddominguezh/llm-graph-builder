import { Router } from 'express';

import { handleMockExecute } from './mockExecuteHandler.js';
import { handleMockLatestVersion } from './mockLatestVersionHandler.js';

export const mockExecuteRouter = Router();

mockExecuteRouter.get('/:agentSlug/latest', handleMockLatestVersion);
mockExecuteRouter.post('/:agentSlug/:version', handleMockExecute);
