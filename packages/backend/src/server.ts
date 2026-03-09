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

  const agentRouter = express.Router();
  agentRouter.use(requireAuth);
  agentRouter.get('/:agentId/graph', handleGetGraph);
  agentRouter.post('/:agentId/graph/operations', handlePostOperations);
  agentRouter.post('/:agentId/publish', handlePostPublish);
  agentRouter.get('/:agentId/versions', handleGetVersions);
  agentRouter.get('/:agentId/versions/:version', handleGetVersion);
  agentRouter.post('/:agentId/versions/:version/restore', handlePostRestore);
  app.use('/agents', agentRouter);

  return app;
}
