import { Router } from 'express';

import { requireInternalAuth } from './internalAuth.js';
import {
  handleKvGetValues,
  handleKvListKeys,
  handleKvSearch,
  handleKvUpdateValue,
} from './toolHandlers/kvHandlers.js';
import { handleRagSearch } from './toolHandlers/ragHandlers.js';

export const internalRouter = Router();

internalRouter.use(requireInternalAuth);

// KV / RAG tool execution endpoints. The edge function (Deno) calls these
// instead of replicating the service logic — backend has Vertex AI auth and
// RE2 bindings that don't load cleanly in Deno.
internalRouter.post('/tools/kv-store/list-keys', handleKvListKeys);
internalRouter.post('/tools/kv-store/get-values', handleKvGetValues);
internalRouter.post('/tools/kv-store/search', handleKvSearch);
internalRouter.post('/tools/kv-store/update-value', handleKvUpdateValue);
internalRouter.post('/tools/rag/search', handleRagSearch);
