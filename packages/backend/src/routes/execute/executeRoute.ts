import { Router } from 'express';

import { requireExecutionAuth } from './executeAuth.js';
import { handleExecute } from './executeHandler.js';
import { handleGetExecutionResult } from './executionResultRoute.js';

export const executeRouter = Router();
executeRouter.post('/:agentSlug/:version', requireExecutionAuth, handleExecute);
executeRouter.get('/result/:executionId', handleGetExecutionResult);
