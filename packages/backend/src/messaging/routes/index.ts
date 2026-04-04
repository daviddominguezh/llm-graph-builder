import express from 'express';

import { ensureMessagingAuth } from '../middleware/ensureMessagingAuth.js';
import { aiHelpersRouter } from './aiHelpers.js';
import { collaboratorsRouter } from './collaborators.js';
import { conversationsRouter } from './conversations.js';
import { inboxRouter } from './inbox.js';
import { integrationsRouter } from './integrations.js';
import { mediaRouter } from './media.js';
import { notesRouter } from './notes.js';
import { sendRouter } from './send.js';
import { userPicsRouter } from './userPics.js';
import { usersRouter } from './users.js';
import { instagramWebhookRouter } from './webhooks/instagram.js';
import { whatsappWebhookRouter } from './webhooks/whatsapp.js';

export const messagingRouter = express.Router();

// Webhook routes — no auth, use signature verification instead
messagingRouter.use('/whatsapp', whatsappWebhookRouter);
messagingRouter.use('/instagram', instagramWebhookRouter);

// All remaining messaging routes use the messaging auth middleware
messagingRouter.use(ensureMessagingAuth);

// Sub-routers
messagingRouter.use('/projects/:tenantId/messages', inboxRouter);
messagingRouter.use('/projects/:tenantId/conversations', conversationsRouter);
messagingRouter.use('/projects/:tenantId/conversations', notesRouter);
messagingRouter.use('/projects/:tenantId/users', usersRouter);
messagingRouter.use('/projects/:tenantId/collaborators', collaboratorsRouter);
messagingRouter.use('/projects/:tenantId/media', mediaRouter);
messagingRouter.use('/projects/:tenantId/ai', aiHelpersRouter);
messagingRouter.use('/projects/:tenantId/integrations', integrationsRouter);
messagingRouter.use('/auth', userPicsRouter);
messagingRouter.use('/messages', sendRouter);
