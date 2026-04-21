import { Router } from 'express';

import { requireInternalAuth } from './internalAuth.js';
import { handleResumeParent } from './resumeParentHandler.js';

export const internalRouter = Router();

internalRouter.use(requireInternalAuth);
internalRouter.post('/resume-parent', handleResumeParent);
