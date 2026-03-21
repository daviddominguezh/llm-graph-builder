import { Router } from 'express';

import { requireExecutionAuth } from './executeAuth.js';
import { handleExecute } from './executeHandler.js';

export const executeRouter = Router();
executeRouter.post('/:agentSlug/:version', requireExecutionAuth, handleExecute);
