import express from 'express';

import { handleDeleteVfsConfig } from './deleteVfsConfig.js';
import { handleGetVfsConfigs } from './getVfsConfigs.js';
import { handleUpsertVfsConfig } from './upsertVfsConfig.js';

export const vfsConfigRouter = express.Router({ mergeParams: true });

vfsConfigRouter.get('/', handleGetVfsConfigs);
vfsConfigRouter.put('/:orgId', handleUpsertVfsConfig);
vfsConfigRouter.delete('/:orgId', handleDeleteVfsConfig);
