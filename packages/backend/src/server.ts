import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';

import { handleMcpRequest } from './mcp-server/server.js';
import { requireAuth } from './middleware/auth.js';
import { agentRouter } from './routes/agents/agentRouter.js';
import { dashboardRouter } from './routes/dashboard/dashboardRouter.js';
import { handleDiscover } from './routes/discover.js';
import { executeRouter } from './routes/execute/executeRoute.js';
import { mcpLibraryRouter } from './routes/mcp-library/mcpLibraryRouter.js';
import { handleCallback } from './routes/oauth/oauthCallback.js';
import { handleGetOpenRouterModels } from './routes/openrouterModels.js';
import { handleCreateOrg } from './routes/orgs/createOrg.js';
import { handleDeleteOrg } from './routes/orgs/deleteOrg.js';
import { handleGetOrgBySlug } from './routes/orgs/getOrgBySlug.js';
import { handleGetOrgRole } from './routes/orgs/getOrgRole.js';
import { handleGetOrgs } from './routes/orgs/getOrgs.js';
import { handleRemoveAvatar, handleUploadAvatar } from './routes/orgs/orgAvatar.js';
import { handleUniqueSlug } from './routes/orgs/uniqueSlug.js';
import { handleUpdateOrg } from './routes/orgs/updateOrg.js';
import { secretsRouter } from './routes/secrets/secretsRouter.js';
import { handleSimulate } from './routes/simulateHandler.js';
import { templateRouter } from './routes/templates/templateRouter.js';
import { handleToolCall } from './routes/toolCall.js';

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
  router.post('/:orgId/avatar', upload.single('file'), handleUploadAvatar);
  router.delete('/:orgId/avatar', handleRemoveAvatar);
  return router;
}

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(requestLogger);

  app.get('/openrouter/models', handleGetOpenRouterModels);
  app.post('/mcp/discover', handleDiscover);
  app.post('/mcp/tools/call', handleToolCall);
  app.post('/simulate', handleSimulate);
  app.get('/mcp/oauth/callback', handleCallback);

  app.post('/mcp', handleMcpRequest);
  app.get('/mcp', handleMcpRequest);
  app.delete('/mcp', handleMcpRequest);

  app.use('/api/agents', executeRouter);
  app.use('/orgs', buildOrgRouter());
  app.use('/agents', agentRouter);
  app.use('/secrets', secretsRouter);
  app.use('/dashboard', dashboardRouter);
  app.use('/mcp-library', mcpLibraryRouter);
  app.use('/templates', templateRouter);

  return app;
}
