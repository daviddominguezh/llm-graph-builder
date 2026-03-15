import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import { requireAuth } from './middleware/auth.js';
import { handleDiscover } from './routes/discover.js';
import { handleGetGraph } from './routes/graph/getGraph.js';
import { handleGetVersion } from './routes/graph/getVersion.js';
import { handleGetVersions } from './routes/graph/getVersions.js';
import { handlePostOperations } from './routes/graph/postOperations.js';
import { handlePostPublish } from './routes/graph/postPublish.js';
import { handlePostRestore } from './routes/graph/postRestore.js';
import { handleCallback } from './routes/oauth/oauthCallback.js';
import { handleDisconnect } from './routes/oauth/oauthDisconnect.js';
import { handleInitiate } from './routes/oauth/oauthInitiate.js';
import { handleResolveToken } from './routes/oauth/oauthResolveToken.js';
import { handleStatus } from './routes/oauth/oauthStatus.js';
import { handleSimulate } from './routes/simulateHandler.js';

function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  process.stdout.write(`[server] ${req.method} ${req.path}\n`);
  next();
}

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(requestLogger);

  app.post('/mcp/discover', handleDiscover);
  app.post('/simulate', handleSimulate);
  app.get('/mcp/oauth/callback', handleCallback);

  const agentRouter = express.Router();
  agentRouter.use(requireAuth);
  agentRouter.get('/:agentId/graph', handleGetGraph);
  agentRouter.post('/:agentId/graph/operations', handlePostOperations);
  agentRouter.post('/:agentId/publish', handlePostPublish);
  agentRouter.get('/:agentId/versions', handleGetVersions);
  agentRouter.get('/:agentId/versions/:version', handleGetVersion);
  agentRouter.post('/:agentId/versions/:version/restore', handlePostRestore);
  agentRouter.post('/mcp-oauth/initiate', handleInitiate);
  agentRouter.get('/mcp-oauth/status', handleStatus);
  agentRouter.post('/mcp-oauth/resolve-token', handleResolveToken);
  agentRouter.delete('/mcp-oauth/connections', handleDisconnect);
  app.use('/agents', agentRouter);

  return app;
}
