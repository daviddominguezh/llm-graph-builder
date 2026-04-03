import express from 'express';

import { ensureMessagingAuth } from '../middleware/ensureMessagingAuth.js';
import { conversationsRouter } from './conversations.js';
import { inboxRouter } from './inbox.js';
import { notesRouter } from './notes.js';
import { sendRouter } from './send.js';

export const messagingRouter = express.Router();

// All messaging routes use the messaging auth middleware
messagingRouter.use(ensureMessagingAuth);

// Sub-routers
messagingRouter.use('/projects/:tenantId/messages', inboxRouter);
messagingRouter.use('/projects/:tenantId/conversations', conversationsRouter);
messagingRouter.use('/projects/:tenantId/conversations', notesRouter);
messagingRouter.use('/messages', sendRouter);
