import type { Request, Response } from 'express';

import { getConnection, upsertConnection } from '../../db/queries/oauthConnectionOperations.js';
import { discoverOAuthMetadata } from '../../mcp/oauth/discovery.js';
import type { ClientRegistration } from '../../mcp/oauth/registration.js';
import { type OAuthStatePayload, verifyState } from '../../mcp/oauth/stateJwt.js';
import { type TokenResponse, exchangeCode } from '../../mcp/oauth/tokenExchange.js';
import {
  createServiceClient,
  extractErrorMessage,
  getRequiredEnv,
  getStringParam,
  logOAuthError,
  logOAuthInfo,
  lookupMcpServerUrl,
  parseClientRegistration,
} from './oauthHelpers.js';

const SECONDS_TO_MS = 1000;

interface ExchangeParams {
  tokenEndpoint: string;
  code: string;
  codeVerifier: string;
  callbackUrl: string;
  mcpServerUrl: string;
  clientId: string;
  registration: ClientRegistration;
}

function computeExpiresAt(expiresIn: number | undefined): Date | null {
  if (expiresIn === undefined) return null;
  return new Date(Date.now() + expiresIn * SECONDS_TO_MS);
}

async function performTokenExchange(params: ExchangeParams): Promise<TokenResponse> {
  return await exchangeCode({
    tokenEndpoint: params.tokenEndpoint,
    code: params.code,
    codeVerifier: params.codeVerifier,
    redirectUri: params.callbackUrl,
    resourceUrl: params.mcpServerUrl,
    creds: {
      clientId: params.clientId,
      clientSecret: params.registration.client_secret,
      authMethod: params.registration.token_endpoint_auth_method,
    },
  });
}

interface StoreTokensArgs {
  state: OAuthStatePayload;
  clientId: string;
  registration: ClientRegistration;
  tokenEndpoint: string;
  tokenResponse: TokenResponse;
}

async function storeTokens(args: StoreTokensArgs): Promise<void> {
  const supabase = createServiceClient();

  await upsertConnection(supabase, {
    orgId: args.state.orgId,
    libraryItemId: args.state.libraryItemId,
    clientId: args.clientId,
    clientRegistration: JSON.stringify(args.registration),
    accessToken: args.tokenResponse.access_token,
    refreshToken: args.tokenResponse.refresh_token ?? null,
    expiresAt: computeExpiresAt(args.tokenResponse.expires_in),
    tokenEndpoint: args.tokenEndpoint,
    scopes: args.tokenResponse.scope ?? null,
    connectedBy: args.state.userId,
  });
}

async function processCallback(code: string, stateToken: string): Promise<void> {
  const state = await verifyState(stateToken);
  const supabase = createServiceClient();
  const mcpServerUrl = await lookupMcpServerUrl(supabase, state.libraryItemId);
  const metadata = await discoverOAuthMetadata(mcpServerUrl);

  const existing = await getConnection(supabase, state.orgId, state.libraryItemId);
  if (existing === null) {
    throw new Error('No OAuth connection found — initiate flow first');
  }

  const registration = parseClientRegistration(existing.clientRegistration);
  const callbackUrl = getRequiredEnv('OAUTH_CALLBACK_URL');

  const tokenResponse = await performTokenExchange({
    tokenEndpoint: metadata.token_endpoint,
    code,
    codeVerifier: state.codeVerifier,
    callbackUrl,
    mcpServerUrl,
    clientId: existing.clientId,
    registration,
  });

  await storeTokens({
    state,
    clientId: existing.clientId,
    registration,
    tokenEndpoint: metadata.token_endpoint,
    tokenResponse,
  });
}

function buildRedirectUrl(success: boolean): string {
  const webUrl = getRequiredEnv('WEB_URL');
  const status = success ? 'success' : 'error';
  return `${webUrl}?oauth=${status}`;
}

export async function handleCallback(req: Request, res: Response): Promise<void> {
  const code = getStringParam(req, 'code');
  const stateToken = getStringParam(req, 'state');

  if (code === undefined || stateToken === undefined) {
    res.redirect(buildRedirectUrl(false));
    return;
  }

  try {
    logOAuthInfo('callback', 'processing authorization code');
    await processCallback(code, stateToken);
    logOAuthInfo('callback', 'token exchange successful');
    res.redirect(buildRedirectUrl(true));
  } catch (err) {
    const message = extractErrorMessage(err);
    logOAuthError('callback', message);
    res.redirect(buildRedirectUrl(false));
  }
}
