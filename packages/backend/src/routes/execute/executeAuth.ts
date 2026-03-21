import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';
import { createHash } from 'node:crypto';

import {
  createServiceClient,
  getAgentBySlugAndOrg,
  getPublishedGraphData,
  updateKeyLastUsed,
  validateExecutionKey,
  validateKeyAgentAccess,
} from '../../db/queries/executionAuthQueries.js';

export interface ExecutionAuthLocals extends Record<string, unknown> {
  orgId: string;
  keyId: string;
  agentId: string;
  version: number;
  supabase: SupabaseClient;
}

export type ExecutionAuthResponse = Response<unknown, ExecutionAuthLocals>;

const BEARER_PREFIX = 'Bearer ';
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const MIN_VERSION = 1;

function extractBearerToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  if (!header.startsWith(BEARER_PREFIX)) return null;
  return header.slice(BEARER_PREFIX.length);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

interface RouteParams {
  agentSlug?: string;
  version?: string;
}

function parseRouteParams(req: Request): { slug: string; version: number } | null {
  const params: RouteParams = req.params;
  if (typeof params.agentSlug !== 'string') return null;
  if (typeof params.version !== 'string') return null;

  const version = Number(params.version);
  if (!Number.isFinite(version) || version < MIN_VERSION) return null;

  return { slug: params.agentSlug, version };
}

async function validateToken(
  supabase: SupabaseClient,
  token: string
): Promise<{ keyId: string; orgId: string } | null> {
  const keyHash = hashToken(token);
  const result = await validateExecutionKey(supabase, keyHash);
  if (result === null) return null;
  return { keyId: result.id, orgId: result.orgId };
}

async function validateAgentAccess(
  supabase: SupabaseClient,
  keyId: string,
  slug: string,
  orgId: string
): Promise<{ agentId: string } | null> {
  const agent = await getAgentBySlugAndOrg(supabase, slug, orgId);
  if (agent === null) return null;

  const hasAccess = await validateKeyAgentAccess(supabase, keyId, agent.id);
  if (!hasAccess) return null;

  return { agentId: agent.id };
}

async function validateAgentVersion(
  supabase: SupabaseClient,
  agentId: string,
  version: number
): Promise<boolean> {
  const graphData = await getPublishedGraphData(supabase, agentId, version);
  return graphData !== null;
}

function setExecutionLocals(res: Response, locals: ExecutionAuthLocals): void {
  Object.assign(res.locals, locals);
}

async function authenticateKey(
  req: Request,
  res: Response,
  supabase: SupabaseClient
): Promise<{ keyId: string; orgId: string } | null> {
  const token = extractBearerToken(req.headers.authorization);
  if (token === null) {
    sendError(res, HTTP_UNAUTHORIZED, 'Missing or malformed Authorization header');
    return null;
  }

  const keyResult = await validateToken(supabase, token);
  if (keyResult === null) {
    sendError(res, HTTP_UNAUTHORIZED, 'Invalid or expired execution key');
    return null;
  }

  return keyResult;
}

interface AuthContext {
  supabase: SupabaseClient;
  keyId: string;
  orgId: string;
}

async function authorizeAgent(
  req: Request,
  res: Response,
  ctx: AuthContext
): Promise<{ agentId: string; version: number } | null> {
  const routeParams = parseRouteParams(req);
  if (routeParams === null) {
    sendError(res, HTTP_NOT_FOUND, 'Invalid agent slug or version');
    return null;
  }

  const agentAccess = await validateAgentAccess(ctx.supabase, ctx.keyId, routeParams.slug, ctx.orgId);
  if (agentAccess === null) {
    sendError(res, HTTP_FORBIDDEN, 'Access denied for this agent');
    return null;
  }

  const versionExists = await validateAgentVersion(ctx.supabase, agentAccess.agentId, routeParams.version);
  if (!versionExists) {
    sendError(res, HTTP_NOT_FOUND, 'Version not found');
    return null;
  }

  return { agentId: agentAccess.agentId, version: routeParams.version };
}

export async function requireExecutionAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const supabase = createServiceClient();

  const keyResult = await authenticateKey(req, res, supabase);
  if (keyResult === null) return;

  const ctx: AuthContext = { supabase, keyId: keyResult.keyId, orgId: keyResult.orgId };
  const agentResult = await authorizeAgent(req, res, ctx);
  if (agentResult === null) return;

  setExecutionLocals(res, {
    orgId: keyResult.orgId,
    keyId: keyResult.keyId,
    agentId: agentResult.agentId,
    version: agentResult.version,
    supabase,
  });

  void updateKeyLastUsed(supabase, keyResult.keyId);
  next();
}
