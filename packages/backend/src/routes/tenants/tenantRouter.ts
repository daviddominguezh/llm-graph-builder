import express from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { handleCreateTenant } from './createTenant.js';
import { handleDeleteTenant } from './deleteTenant.js';
import { handleGetTenants } from './getTenants.js';
import { handleUpdateTenant } from './updateTenant.js';

export const tenantRouter = express.Router();
tenantRouter.use(requireAuth);

tenantRouter.get('/:orgId', handleGetTenants);
tenantRouter.post('/', handleCreateTenant);
tenantRouter.patch('/:tenantId', handleUpdateTenant);
tenantRouter.delete('/:tenantId', handleDeleteTenant);
