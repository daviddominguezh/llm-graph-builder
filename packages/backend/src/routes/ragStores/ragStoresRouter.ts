import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleCreateRagStore } from './createRagStore.js';
import { handleDeleteRagStore } from './deleteRagStore.js';
import { handleGetRagStores } from './getRagStores.js';

export const ragStoresRouter = express.Router();
ragStoresRouter.use(requireAuth);

ragStoresRouter.get('/:orgId', handleGetRagStores);
ragStoresRouter.post('/', handleCreateRagStore);
ragStoresRouter.delete('/:storeId', handleDeleteRagStore);
