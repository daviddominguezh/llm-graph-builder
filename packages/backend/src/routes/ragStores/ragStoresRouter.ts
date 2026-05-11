import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleCreateRagStore } from './createRagStore.js';
import { handleDeleteRagStore } from './deleteRagStore.js';
import { handleGetRagStores } from './getRagStores.js';
import { ragFilesRouter } from './ragFiles/ragFilesRouter.js';
import { handleSearchChunks } from './ragFiles/searchChunks.js';

export const ragStoresRouter = express.Router();
ragStoresRouter.use(requireAuth);

ragStoresRouter.get('/:orgId', handleGetRagStores);
ragStoresRouter.post('/', handleCreateRagStore);
ragStoresRouter.delete('/:storeId', handleDeleteRagStore);
ragStoresRouter.use('/:storeId/files', ragFilesRouter);
ragStoresRouter.post('/:storeId/search', handleSearchChunks);
