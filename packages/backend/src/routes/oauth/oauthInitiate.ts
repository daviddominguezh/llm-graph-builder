import type { Request } from 'express';

import { getConnection, upsertConnection } from '../../db/queries/oauthConnectionOperations.js';
import { type OAuthMetadata, discoverOAuthMetadata } from '../../mcp/oauth/discovery.js';
import { computeCodeChallenge, generateCodeVerifier } from '../../mcp/oauth/pkce.js';
import { type ClientRegistration, registerClient } from '../../mcp/oauth/registration.js';
import { signState } from '../../mcp/oauth/stateJwt.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_OK } from '../routeHelpers.js';
import {
  extractErrorMessage,
  getRequiredEnv,
  logOAuthError,
  logOAuthInfo,
  lookupMcpServerUrl,
  parseClientRegistration,
  sendBadRequest,
  sendInternalError,
} from './oauthHelpers.js';

interface InitiateBody {
  orgId?: string;
  libraryItemId?: string;
}

interface AuthorizeUrlParts {
  authorizationEndpoint: string;
  clientId: string;
  callbackUrl: string;
  codeChallenge: string;
  stateToken: string;
}

function buildAuthorizeUrl(parts: AuthorizeUrlParts): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: parts.clientId,
    redirect_uri: parts.callbackUrl,
    code_challenge: parts.codeChallenge,
    code_challenge_method: 'S256',
    state: parts.stateToken,
  });
  return `${parts.authorizationEndpoint}?${params.toString()}`;
}

interface ResolveClientArgs {
  supabase: AuthenticatedLocals['supabase'];
  orgId: string;
  libraryItemId: string;
  metadata: OAuthMetadata;
  callbackUrl: string;
}

interface ResolvedClient {
  clientId: string;
  registration: ClientRegistration;
}

async function resolveClientId(args: ResolveClientArgs): Promise<ResolvedClient> {
  const existing = await getConnection(args.supabase, args.orgId, args.libraryItemId);

  if (existing !== null) {
    const registration = parseClientRegistration(existing.clientRegistration);
    return { clientId: existing.clientId, registration };
  }

  if (args.metadata.registration_endpoint === undefined) {
    throw new Error('No registration endpoint and no existing client');
  }

  const registration = await registerClient(args.metadata.registration_endpoint, args.callbackUrl);
  return { clientId: registration.client_id, registration };
}

interface StoreRegistrationArgs {
  supabase: AuthenticatedLocals['supabase'];
  orgId: string;
  libraryItemId: string;
  clientId: string;
  registration: ClientRegistration;
  tokenEndpoint: string;
  userId: string;
}

async function storeRegistration(args: StoreRegistrationArgs): Promise<void> {
  await upsertConnection(args.supabase, {
    orgId: args.orgId,
    libraryItemId: args.libraryItemId,
    clientId: args.clientId,
    clientRegistration: JSON.stringify(args.registration),
    accessToken: 'pending',
    refreshToken: null,
    expiresAt: null,
    tokenEndpoint: args.tokenEndpoint,
    scopes: null,
    connectedBy: args.userId,
  });
}

interface InitiateContext {
  supabase: AuthenticatedLocals['supabase'];
  orgId: string;
  libraryItemId: string;
  userId: string;
}

async function generateInitiateUrl(ctx: InitiateContext): Promise<string> {
  const callbackUrl = getRequiredEnv('OAUTH_CALLBACK_URL');
  const mcpServerUrl = await lookupMcpServerUrl(ctx.supabase, ctx.libraryItemId);
  const metadata = await discoverOAuthMetadata(mcpServerUrl);
  const { clientId, registration } = await resolveClientId({
    supabase: ctx.supabase,
    orgId: ctx.orgId,
    libraryItemId: ctx.libraryItemId,
    metadata,
    callbackUrl,
  });

  await storeRegistration({
    supabase: ctx.supabase,
    orgId: ctx.orgId,
    libraryItemId: ctx.libraryItemId,
    clientId,
    registration,
    tokenEndpoint: metadata.token_endpoint,
    userId: ctx.userId,
  });

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = computeCodeChallenge(codeVerifier);
  const stateToken = await signState({
    orgId: ctx.orgId,
    libraryItemId: ctx.libraryItemId,
    userId: ctx.userId,
    codeVerifier,
  });

  return buildAuthorizeUrl({
    authorizationEndpoint: metadata.authorization_endpoint,
    clientId,
    callbackUrl,
    codeChallenge,
    stateToken,
  });
}

function extractStringField(obj: object, key: string): string | undefined {
  if (!(key in obj)) return undefined;
  const value: unknown = Object.getOwnPropertyDescriptor(obj, key)?.value;
  return typeof value === 'string' ? value : undefined;
}

function parseInitiateBody(body: unknown): InitiateBody {
  if (typeof body !== 'object' || body === null) return {};
  return {
    orgId: extractStringField(body, 'orgId'),
    libraryItemId: extractStringField(body, 'libraryItemId'),
  };
}

export async function handleInitiate(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { orgId, libraryItemId } = parseInitiateBody(req.body);
  const { supabase, userId }: AuthenticatedLocals = res.locals;

  if (orgId === undefined || libraryItemId === undefined) {
    sendBadRequest(res, 'orgId and libraryItemId are required');
    return;
  }

  try {
    logOAuthInfo('initiate', `orgId=${orgId} libraryItemId=${libraryItemId}`);
    const authorizeUrl = await generateInitiateUrl({ supabase, orgId, libraryItemId, userId });
    res.status(HTTP_OK).json({ authorizeUrl });
  } catch (err) {
    const message = extractErrorMessage(err);
    logOAuthError('initiate', message);
    sendInternalError(res, message);
  }
}
