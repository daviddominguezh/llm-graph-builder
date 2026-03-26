import express from 'express';
import multer from 'multer';

import { requireAuth } from '../../middleware/auth.js';
import { handleBrowseLibrary } from './browseLibrary.js';
import { handleGetLibraryItem } from './getLibraryItem.js';
import { handleInstallLibraryItem } from './installLibraryItem.js';
import { handleRemoveMcpImage, handleUploadMcpImage } from './mcpLibraryImage.js';
import { handlePublishLibraryItem } from './publishLibraryItem.js';
import { handleUnpublishLibraryItem } from './unpublishLibraryItem.js';

const MAX_IMAGE_BYTES = 2_097_152;
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES } });

export const mcpLibraryRouter = express.Router();
mcpLibraryRouter.use(requireAuth);

mcpLibraryRouter.get('/', handleBrowseLibrary);
mcpLibraryRouter.get('/:entryId', handleGetLibraryItem);
mcpLibraryRouter.post('/', handlePublishLibraryItem);
mcpLibraryRouter.delete('/:entryId', handleUnpublishLibraryItem);
mcpLibraryRouter.post('/:entryId/install', handleInstallLibraryItem);
mcpLibraryRouter.post('/:entryId/image', imageUpload.single('file'), handleUploadMcpImage);
mcpLibraryRouter.delete('/:entryId/image', handleRemoveMcpImage);
