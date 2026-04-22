import { Router } from 'express';

import { handleLatestVersion } from './latestVersionHandler.js';

export const publicChatRouter = Router();
publicChatRouter.get('/latest-version/:tenantSlug/:agentSlug', handleLatestVersion);
