import { Router } from 'express';
import type { Request, Response } from 'express';

import { createServiceClient } from '../../db/queries/executionAuthQueries.js';
import { createFireHandler } from '../../triggers/fireHandler.js';
import { getTriggerScheduler } from '../../triggers/schedulerSingleton.js';
import { defaultUserId, execTimeoutMs, jitterWindowMs, maxHorizonMs } from '../../triggers/triggerConfig.js';
import { requireInternalAuth } from './internalAuth.js';
import { handleMcpInvoke } from './mcpInvoke.js';
import { handleEmbed, handleRerank } from './utilityHandlers.js';

export const internalRouter = Router();

internalRouter.use(requireInternalAuth);

// Node-only utility shims for the Supabase edge function: Vertex embeddings
// (requires service-account auth) and Vertex semantic-ranker reranking. All
// KV/RAG Postgres work lives in the edge function itself.
internalRouter.post('/embed', handleEmbed);
internalRouter.post('/rerank', handleRerank);

// MCP tool invocation: resolve binding server-side, borrow a pooled connection
// (egress re-validated on borrow), call the tool, release. Auth is the static
// x-master-key gate above; exempt from the JWT gate via SYSTEM_PUBLIC_UNAUTHED.
internalRouter.post('/mcp/invoke', handleMcpInvoke);

// The fire handler's deps (service Supabase client + scheduler singleton) read
// required env at construction and throw when unset. Build them lazily on the
// first request — memoized — so importing this router (e.g. in tests) never
// triggers that construction, mirroring how /embed defers its Vertex client.
type FireHandler = (req: Request, res: Response) => Promise<void>;
let fireHandler: FireHandler | undefined = undefined;

function getFireHandler(): FireHandler {
  fireHandler ??= createFireHandler({
    supabase: createServiceClient(),
    scheduler: getTriggerScheduler(),
    defaultUserId: defaultUserId(),
    jitterWindowMs: jitterWindowMs(),
    execTimeoutMs: execTimeoutMs(),
    horizonMs: maxHorizonMs(),
  });
  return fireHandler;
}

// Event-driven webhook invoked by the scheduler (Cloud Tasks in prod, local
// timer otherwise). Auth is the static x-master-key check above; this path is
// exempt from the JWT gate via SYSTEM_PUBLIC_UNAUTHED in server.ts.
internalRouter.post('/triggers/fire', async (req, res) => {
  await getFireHandler()(req, res);
});
