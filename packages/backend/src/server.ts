import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import { handleMcpRequest } from './mcp-server/server.js';
import { requireAuth } from './middleware/auth.js';
import { agentRouter } from './routes/agents/agentRouter.js';
import { dashboardRouter } from './routes/dashboard/dashboardRouter.js';
import { handleDiscover } from './routes/discover.js';
import { executeRouter } from './routes/execute/executeRoute.js';
import { buildGitHubRouter } from './routes/github/githubRouter.js';
import { handleGitHubWebhook } from './routes/github/webhookRoute.js';
import { mcpLibraryRouter } from './routes/mcp-library/mcpLibraryRouter.js';
import { handleCallback } from './routes/oauth/oauthCallback.js';
import { handleGetOpenRouterModels } from './routes/openrouterModels.js';
import { handleAddMember } from './routes/orgs/addMember.js';
import { handleCancelInvitation } from './routes/orgs/cancelInvitation.js';
import { handleCreateOrg } from './routes/orgs/createOrg.js';
import { handleDeleteOrg } from './routes/orgs/deleteOrg.js';
import { handleGetInvitations } from './routes/orgs/getInvitations.js';
import { handleGetMembers } from './routes/orgs/getMembers.js';
import { handleGetOrgBySlug } from './routes/orgs/getOrgBySlug.js';
import { handleGetOrgRole } from './routes/orgs/getOrgRole.js';
import { handleGetOrgs } from './routes/orgs/getOrgs.js';
import { handleRemoveAvatar, handleUploadAvatar } from './routes/orgs/orgAvatar.js';
import { handleRemoveMember } from './routes/orgs/removeMember.js';
import { handleUniqueSlug } from './routes/orgs/uniqueSlug.js';
import { handleUpdateMemberRole } from './routes/orgs/updateMemberRole.js';
import { handleUpdateOrg } from './routes/orgs/updateOrg.js';
import { secretsRouter } from './routes/secrets/secretsRouter.js';
import { handleSimulateAgent } from './routes/simulateAgentHandler.js';
import { handleSimulate } from './routes/simulateHandler.js';
import { handleCheckAvailability } from './routes/slugs/checkAvailability.js';
import { templateRouter } from './routes/templates/templateRouter.js';
import { tenantRouter } from './routes/tenants/tenantRouter.js';
import { handleToolCall } from './routes/toolCall.js';
import { messagingRouter } from './messaging/routes/index.js';

function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  process.stdout.write(`[server] ${req.method} ${req.path}\n`);
  next();
}

const MAX_AVATAR_BYTES = 2_097_152;

function buildOrgRouter(): express.Router {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AVATAR_BYTES } });
  const router = express.Router();
  router.use(requireAuth);
  router.get('/', handleGetOrgs);
  router.post('/', handleCreateOrg);
  router.post('/unique-slug', handleUniqueSlug);
  router.get('/by-slug/:slug', handleGetOrgBySlug);
  router.patch('/:orgId', handleUpdateOrg);
  router.delete('/:orgId', handleDeleteOrg);
  router.get('/:orgId/role', handleGetOrgRole);
  router.get('/:orgId/members', handleGetMembers);
  router.post('/:orgId/members', handleAddMember);
  router.patch('/:orgId/members/:userId', handleUpdateMemberRole);
  router.delete('/:orgId/members/:userId', handleRemoveMember);
  router.get('/:orgId/invitations', handleGetInvitations);
  router.delete('/:orgId/invitations/:invitationId', handleCancelInvitation);
  router.post('/:orgId/avatar', upload.single('file'), handleUploadAvatar);
  router.delete('/:orgId/avatar', handleRemoveAvatar);
  return router;
}

function buildSlugRouter(): express.Router {
  const router = express.Router();
  router.use(requireAuth);
  router.post('/check-availability', handleCheckAvailability);
  return router;
}

export function createApp(): Express {
  const app = express();

  app.use(cors());

  // Webhook route must be registered BEFORE express.json() so the body
  // arrives as a raw string for HMAC-SHA256 signature verification.
  app.post('/webhooks/github', express.text({ type: 'application/json' }), handleGitHubWebhook);

  app.use(express.json({ limit: '10mb' }));
  app.use(requestLogger);

  app.get('/openrouter/models', handleGetOpenRouterModels);
  app.post('/mcp/discover', handleDiscover);
  app.post('/mcp/tools/call', handleToolCall);
  app.post('/simulate', handleSimulate);
  app.post('/simulate-agent', handleSimulateAgent);
  app.get('/mcp/oauth/callback', handleCallback);

  app.post('/mcp', handleMcpRequest);
  app.get('/mcp', handleMcpRequest);
  app.delete('/mcp', handleMcpRequest);

  app.use('/api/agents', executeRouter);
  app.use('/orgs', buildOrgRouter());
  app.use('/slugs', buildSlugRouter());
  app.use('/agents', agentRouter);
  app.use('/secrets', secretsRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/mcp-library', mcpLibraryRouter);
  app.use('/tenants', tenantRouter);
  app.use('/templates', templateRouter);
  app.use('/github', buildGitHubRouter());

  // Messaging routes (auth middleware applied inside the router)
  app.use(messagingRouter);

  // Socket.io will be initialized in Task 24:
  // import { initializeSocketIO } from './messaging/socket/index.js';
  // initializeSocketIO(httpServer);

  return app;
}
