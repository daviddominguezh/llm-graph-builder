import { Router } from 'express';

import { handleExecuteChild } from './executeChildHandler.js';
import { requireInternalAuth } from './internalAuth.js';
import { handleResumeParent } from './resumeParentHandler.js';

export const internalRouter = Router();

internalRouter.use(requireInternalAuth);
internalRouter.post('/execute-child', handleExecuteChild);
internalRouter.post('/resume-parent', handleResumeParent);
