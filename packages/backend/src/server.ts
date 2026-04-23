import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import { handleMcpRequest } from './mcp-server/server.js';
import { messagingRouter } from './messaging/routes/index.js';
import { requireAuth } from './middleware/auth.js';
import { assertGateCoverage } from './middleware/gateWalker.js';
import {
  requireGateComplete,
  requireOnboardingIncomplete,
  requirePhoneUnverified,
} from './middleware/gates.js';
import { agentRouter } from './routes/agents/agentRouter.js';
import {
  AUTH_PUBLIC_AUTHED,
  AUTH_PUBLIC_UNAUTHED,
  buildAuthPublicRouter,
} from './routes/auth/authPublicRouter.js';
import { buildAuthRouter } from './routes/auth/authRouter.js';
import { dashboardRouter } from './routes/dashboard/dashboardRouter.js';
import { handleDiscover } from './routes/discover.js';
import { executeRouter } from './routes/execute/executeRoute.js';
import { buildGitHubRouter } from './routes/github/githubRouter.js';
import { handleGitHubWebhook } from './routes/github/webhookRoute.js';
import { internalRouter } from './routes/internal/internalRouter.js';
import { mcpLibraryRouter } from './routes/mcp-library/mcpLibraryRouter.js';
import { mockExecuteRouter } from './routes/mockExecute/mockExecuteRouter.js';
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
import { handleGetOrgSettingsBundle } from './routes/orgs/getOrgSettingsBundle.js';
import { handleGetOrgs } from './routes/orgs/getOrgs.js';
import { handleRemoveAvatar, handleUploadAvatar } from './routes/orgs/orgAvatar.js';
import { handleRemoveMember } from './routes/orgs/removeMember.js';
import { handleUniqueSlug } from './routes/orgs/uniqueSlug.js';
import { handleUpdateMemberRole } from './routes/orgs/updateMemberRole.js';
import { handleUpdateOrg } from './routes/orgs/updateOrg.js';
import { publicChatRouter } from './routes/publicChat/publicChatRouter.js';
import { secretsRouter } from './routes/secrets/secretsRouter.js';
import { handleSimulateAgent } from './routes/simulateAgentHandler.js';
import { handleSimulate } from './routes/simulateHandler.js';
import { handleCheckAvailability } from './routes/slugs/checkAvailability.js';
import { templateRouter } from './routes/templates/templateRouter.js';
import { tenantRouter } from './routes/tenants/tenantRouter.js';
import { handleToolCall } from './routes/toolCall.js';
import { whatsappTemplatesRouter } from './routes/whatsappTemplates/whatsappTemplatesRouter.js';

function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  process.stdout.write(`[server] ${req.method} ${req.path}\n`);
  next();
}

const MAX_AVATAR_BYTES = 2_097_152;

// Wraps a router so the walker sees requireAuth + requireGateComplete in the chain.
// Used for routers that already have requireAuth internally — this creates a parent
// router whose middleware is collected by the gate walker before descending into the child.
function withGate(router: express.Router): express.Router {
  const wrapper = express.Router();
  wrapper.use(requireAuth);
  wrapper.use(requireGateComplete);
  wrapper.use(router);
  return wrapper;
}

function buildOrgRouter(): express.Router {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AVATAR_BYTES } });
  const router = express.Router();
  router.use(requireAuth);
  router.get('/', handleGetOrgs);
  router.post('/', handleCreateOrg);
  router.post('/unique-slug', handleUniqueSlug);
  router.get('/by-slug/:slug', handleGetOrgBySlug);
  router.get('/by-slug/:slug/settings-bundle', handleGetOrgSettingsBundle);
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

// Paths using non-standard auth (executeAuth, ensureMessagingAuth, requireInternalAuth)
// or intentionally unauthenticated system/dev routes.
const SYSTEM_PUBLIC_UNAUTHED = [
  '/mcp/discover',
  '/mcp/tools/call',
  '/simulate',
  '/simulate-agent',
  '/mcp',
  '/api/agents/:agentSlug/:version',
  '/api/mock-execute/:agentSlug/:version',
  '/api/chat/latest-version/:tenantSlug/:agentSlug',
  '/internal/resume-parent',
  // Messaging webhook routes (signature-verified, not JWT)
  '/whatsapp/webhook',
  '/instagram/webhook',
  // Messaging authenticated routes (use ensureMessagingAuth API key, not requireAuth)
  '/projects/:tenantId/conversations/:conversationId/read',
  '/projects/:tenantId/conversations/:conversationId/chatbot',
  '/projects/:tenantId/conversations/:conversationId/assignee',
  '/projects/:tenantId/conversations/:conversationId/status',
  '/projects/:tenantId/conversations/:conversationId',
  '/projects/:tenantId/conversations/:conversationId/notes',
  '/projects/:tenantId/conversations/:conversationId/notes/:noteId',
  '/projects/:tenantId/media/',
  '/projects/:tenantId/ai/make-friendly',
  '/projects/:tenantId/ai/make-formal',
  '/projects/:tenantId/ai/fix-grammar',
  '/projects/:tenantId/ai/answer-question',
  '/projects/:tenantId/integrations/whatsapp',
  '/projects/:tenantId/integrations/whatsapp/:connectionId',
  '/messages/messages/message',
  '/messages/messages/:tenantId/:conversationId',
];

function mountSystemRoutes(app: Express): void {
  // Webhook must be before express.json() for raw body HMAC verification
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
}

function mountApiRoutes(app: Express): void {
  app.use('/api/agents', executeRouter);
  app.use('/api/chat', publicChatRouter);
  if (process.env.ENABLE_MOCK_EXECUTE === 'true') {
    app.use('/api/mock-execute', mockExecuteRouter);
  }
}

function mountGatedRoutes(app: Express): void {
  app.use('/orgs', withGate(buildOrgRouter()));
  app.use('/slugs', withGate(buildSlugRouter()));
  app.use('/agents', withGate(agentRouter));
  app.use('/secrets', withGate(secretsRouter));
  app.use('/dashboard', withGate(dashboardRouter));
  app.use('/mcp-library', withGate(mcpLibraryRouter));
  app.use('/tenants', withGate(tenantRouter));
  app.use('/templates', withGate(templateRouter));
  app.use('/tenants/:tenantId/whatsapp-templates', withGate(whatsappTemplatesRouter));
  app.use('/github', withGate(buildGitHubRouter()));
}

function mountAuthAndMessagingRoutes(app: Express): void {
  app.use('/auth/public', buildAuthPublicRouter());
  app.use('/auth', buildAuthRouter());
  app.use(messagingRouter);
  app.use('/internal', internalRouter);
}

function runGateCoverage(app: Express): void {
  const publicUnauthed = [...AUTH_PUBLIC_UNAUTHED, ...SYSTEM_PUBLIC_UNAUTHED];
  assertGateCoverage(app, {
    requireAuth,
    gates: [requireGateComplete, requirePhoneUnverified, requireOnboardingIncomplete],
    publicUnauthed,
    publicAuthed: AUTH_PUBLIC_AUTHED,
    webhookPrefix: '/webhooks',
  });
}

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? '1'));

  mountSystemRoutes(app);
  mountApiRoutes(app);
  mountGatedRoutes(app);
  mountAuthAndMessagingRoutes(app);
  runGateCoverage(app);

  return app;
}
