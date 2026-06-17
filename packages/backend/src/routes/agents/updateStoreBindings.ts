import type { Request } from 'express';
import { z } from 'zod';

import { getAgentById } from '../../db/queries/agentQueries.js';
import {
  type AgentStoreBindings,
  updateAgentStoreBindingsWithPrecondition,
} from '../../db/queries/agentStoreBindingsQueries.js';
import { getKvStoreById } from '../../db/queries/kvStoresQueries.js';
import { getRagStoreById } from '../../db/queries/ragStoresQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
  getAgentId,
} from '../routeHelpers.js';

const HTTP_CONFLICT = 409;
const HTTP_FORBIDDEN = 403;

const BodySchema = z.object({
  expectedUpdatedAt: z.string(),
  selectedKvStoreId: z.uuid().nullable(),
  selectedRagStoreId: z.uuid().nullable(),
});

type Body = z.infer<typeof BodySchema>;

function sendBadRequest(res: AuthenticatedResponse, message: string): void {
  res.status(HTTP_BAD_REQUEST).json({ error: message });
}

function sendOk(res: AuthenticatedResponse, bindings: AgentStoreBindings): void {
  res.status(HTTP_OK).json(bindings);
}

interface OrgGuardArgs {
  supabase: AuthenticatedLocals['supabase'];
  agentOrgId: string;
  body: Body;
}

async function validateKvStoreOrg(args: OrgGuardArgs): Promise<string | null> {
  if (args.body.selectedKvStoreId === null) return null;
  const kv = await getKvStoreById(args.supabase, args.body.selectedKvStoreId);
  if (kv.result?.org_id !== args.agentOrgId) return 'store_org_mismatch';
  return null;
}

async function validateRagStoreOrg(args: OrgGuardArgs): Promise<string | null> {
  if (args.body.selectedRagStoreId === null) return null;
  const rag = await getRagStoreById(args.supabase, args.body.selectedRagStoreId);
  if (rag.result?.org_id !== args.agentOrgId) return 'store_org_mismatch';
  return null;
}

async function validateStoresMatchOrg(args: OrgGuardArgs): Promise<string | null> {
  const kvErr = await validateKvStoreOrg(args);
  if (kvErr !== null) return kvErr;
  return await validateRagStoreOrg(args);
}

interface UpdateContext {
  supabase: AuthenticatedLocals['supabase'];
  agentId: string;
  body: Body;
  res: AuthenticatedResponse;
}

async function performUpdate(ctx: UpdateContext): Promise<void> {
  const updated = await updateAgentStoreBindingsWithPrecondition(
    ctx.supabase,
    ctx.agentId,
    ctx.body.expectedUpdatedAt,
    {
      selectedKvStoreId: ctx.body.selectedKvStoreId,
      selectedRagStoreId: ctx.body.selectedRagStoreId,
    }
  );
  if (updated.conflict) {
    ctx.res.status(HTTP_CONFLICT).json({ error: 'conflict' });
    return;
  }
  if (updated.error !== null) {
    ctx.res.status(HTTP_INTERNAL_ERROR).json({ error: updated.error });
    return;
  }
  if (updated.result === null) {
    ctx.res.status(HTTP_INTERNAL_ERROR).json({ error: 'update returned no row' });
    return;
  }
  sendOk(ctx.res, updated.result);
}

async function processRequest(agentId: string, body: Body, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const agentRes = await getAgentById(supabase, agentId);
  if (agentRes.result === null) {
    res.status(HTTP_NOT_FOUND).json({ error: 'agent not found' });
    return;
  }
  const orgErr = await validateStoresMatchOrg({
    supabase,
    agentOrgId: agentRes.result.org_id,
    body,
  });
  if (orgErr !== null) {
    res.status(HTTP_FORBIDDEN).json({ error: orgErr });
    return;
  }
  await performUpdate({ supabase, agentId, body, res });
}

export async function handleUpdateStoreBindings(req: Request, res: AuthenticatedResponse): Promise<void> {
  const agentId = getAgentId(req);
  if (agentId === undefined) {
    sendBadRequest(res, 'agentId required');
    return;
  }
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendBadRequest(res, parsed.error.message);
    return;
  }
  try {
    await processRequest(agentId, parsed.data, res);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
