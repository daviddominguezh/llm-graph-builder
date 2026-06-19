import { Router } from 'express';

import { requireInternalAuth } from './internalAuth.js';
import { handleEmbed, handleRegexValidate } from './utilityHandlers.js';

export const internalRouter = Router();

internalRouter.use(requireInternalAuth);

// Node-only utility shims for the Supabase edge function: Vertex embeddings
// (requires service-account auth) and RE2-based regex validation (native
// addon). All KV/RAG Postgres work lives in the edge function itself.
internalRouter.post('/embed', handleEmbed);
internalRouter.post('/regex/validate', handleRegexValidate);
