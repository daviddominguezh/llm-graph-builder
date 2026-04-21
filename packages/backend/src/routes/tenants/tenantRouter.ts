import express from 'express';
import multer from 'multer';

import { requireAuth } from '../../middleware/auth.js';
import { handleCreateTenant } from './createTenant.js';
import { handleDeleteTenant } from './deleteTenant.js';
import { handleGetTenantBySlug } from './getTenantBySlug.js';
import { handleGetTenants } from './getTenants.js';
import { handleRemoveTenantAvatar, handleUploadTenantAvatar } from './tenantAvatar.js';
import { handleUpdateTenant } from './updateTenant.js';

const MAX_AVATAR_BYTES = 2_097_152;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AVATAR_BYTES } });

export const tenantRouter = express.Router();
tenantRouter.use(requireAuth);

tenantRouter.get('/by-slug/:orgId/:slug', handleGetTenantBySlug);
tenantRouter.get('/:orgId', handleGetTenants);
tenantRouter.post('/', handleCreateTenant);
tenantRouter.patch('/:tenantId', handleUpdateTenant);
tenantRouter.delete('/:tenantId', handleDeleteTenant);
tenantRouter.post('/:tenantId/avatar', upload.single('file'), handleUploadTenantAvatar);
tenantRouter.delete('/:tenantId/avatar', handleRemoveTenantAvatar);
