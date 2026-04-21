import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleCreateTemplate } from './createHandler.js';
import { handleDeleteTemplate } from './deleteHandler.js';
import { handleListConnections, handleListTemplates } from './listHandler.js';

export const whatsappTemplatesRouter = express.Router({ mergeParams: true });

whatsappTemplatesRouter.use(requireAuth);

whatsappTemplatesRouter.get('/', handleListTemplates);
whatsappTemplatesRouter.post('/', handleCreateTemplate);
whatsappTemplatesRouter.get('/connections', handleListConnections);
whatsappTemplatesRouter.delete('/:templateId', handleDeleteTemplate);
