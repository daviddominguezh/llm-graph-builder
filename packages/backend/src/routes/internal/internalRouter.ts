import { Router } from 'express';

import { requireInternalAuth } from './internalAuth.js';
import {
  handleKvGetValues,
  handleKvListKeys,
  handleKvSearch,
  handleKvUpdateValue,
} from './toolHandlers/kvHandlers.js';
import { handleRagSearch } from './toolHandlers/ragHandlers.js';
import { handleEmbed, handleRegexValidate } from './utilityHandlers.js';

export const internalRouter = Router();

internalRouter.use(requireInternalAuth);

// Node-only utility shims for the Supabase edge function: Vertex embeddings
// (requires service-account auth) and RE2-based regex validation (native
// addon). All KV/RAG Postgres work has moved into the edge function itself.
internalRouter.post('/embed', handleEmbed);
internalRouter.post('/regex/validate', handleRegexValidate);

// KV / RAG tool execution endpoints. The edge function (Deno) calls these
// instead of replicating the service logic — backend has Vertex AI auth and
// RE2 bindings that don't load cleanly in Deno.
internalRouter.post('/tools/kv-store/list-keys', handleKvListKeys);
internalRouter.post('/tools/kv-store/get-values', handleKvGetValues);
internalRouter.post('/tools/kv-store/search', handleKvSearch);
internalRouter.post('/tools/kv-store/update-value', handleKvUpdateValue);
internalRouter.post('/tools/rag/search', handleRagSearch);
