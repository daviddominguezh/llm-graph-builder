import cors from 'cors';
import express, { type Express } from 'express';

import { handleDiscover } from './routes/discover.js';
import { handleSimulate } from './routes/simulateHandler.js';

export function createApp(): Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.post('/mcp/discover', handleDiscover);
  app.post('/simulate', handleSimulate);

  return app;
}
