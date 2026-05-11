import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleCreateKvStore } from './createKvStore.js';
import { handleDeleteKvStore } from './deleteKvStore.js';
import { handleGetKvEntries } from './getKvEntries.js';
import { handleGetKvStores } from './getKvStores.js';
import { handleSaveKvEntries } from './saveKvEntries.js';

export const kvStoresRouter = express.Router();
kvStoresRouter.use(requireAuth);

kvStoresRouter.get('/:orgId', handleGetKvStores);
kvStoresRouter.post('/', handleCreateKvStore);
kvStoresRouter.delete('/:storeId', handleDeleteKvStore);
kvStoresRouter.get('/:storeId/entries/:tenantId', handleGetKvEntries);
kvStoresRouter.put('/:storeId/entries/:tenantId', handleSaveKvEntries);
