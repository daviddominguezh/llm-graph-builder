import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleBrowseTemplates } from './browseTemplates.js';
import { handleGetTemplateSnapshot } from './getTemplateSnapshot.js';
import { handleGetTemplateVersions } from './getTemplateVersions.js';

export const templateRouter = express.Router();
templateRouter.use(requireAuth);

templateRouter.get('/', handleBrowseTemplates);
templateRouter.get('/:agentId/versions', handleGetTemplateVersions);
templateRouter.get('/:agentId/versions/:version', handleGetTemplateSnapshot);
