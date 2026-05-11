import express from 'express';

import { requireAuth } from '../../../middleware/auth.js';
import { handleConfirmUpload } from './confirmUpload.js';
import { handleDeleteFile } from './deleteFile.js';
import { handleGetChunks } from './getChunks.js';
import { handleGetFile } from './getFile.js';
import { handleInitUpload } from './initUpload.js';
import { handleListFiles } from './listFiles.js';
import { handleStreamStatus } from './streamStatus.js';

export const ragFilesRouter = express.Router({ mergeParams: true });
ragFilesRouter.use(requireAuth);

ragFilesRouter.post('/init', handleInitUpload);
ragFilesRouter.get('/', handleListFiles);
ragFilesRouter.get('/:id', handleGetFile);
ragFilesRouter.get('/:id/chunks', handleGetChunks);
ragFilesRouter.get('/:id/stream', handleStreamStatus);
ragFilesRouter.post('/:id/start', handleConfirmUpload);
ragFilesRouter.delete('/:id', handleDeleteFile);
