import express from 'express';

import { ensureMessagingAuth } from '../middleware/ensureMessagingAuth.js';

export const messagingRouter = express.Router();

// All messaging routes use the messaging auth middleware
messagingRouter.use(ensureMessagingAuth);

// Sub-routers will be mounted here as they are implemented:
// messagingRouter.use('/projects/:tenantId/messages', inboxRouter);
// messagingRouter.use('/projects/:tenantId/conversations', conversationsRouter);
// messagingRouter.use('/messages', sendRouter);
// etc.
