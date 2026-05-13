import type { Request, Response } from 'express';

import { upsertGoogleConnection } from '../../db/queries/googleOauthConnectionOperations.js';
import { GOOGLE_TOKEN_ENDPOINT, loadGoogleOAuthConfig } from '../../google/calendar/oauthConfig.js';
import { type GoogleOAuthStatePayload, verifyGoogleState } from '../../google/calendar/stateJwt.js';
import { type GoogleTokenResponse, exchangeGoogleCode } from '../../google/calendar/tokenExchange.js';
import {
  createServiceClient,
  extractErrorMessage,
  getRequiredEnv,
  getStringParam,
  logOAuthError,
  logOAuthInfo,
} from './oauthHelpers.js';

const SECONDS_TO_MS = 1000;

function computeExpiresAt(expiresIn: number | undefined): Date | null {
  if (expiresIn === undefined) return null;
  return new Date(Date.now() + expiresIn * SECONDS_TO_MS);
}

interface StoreTokensArgs {
  state: GoogleOAuthStatePayload;
  clientId: string;
  tokenResponse: GoogleTokenResponse;
}

async function storeTokens(args: StoreTokensArgs): Promise<void> {
  const supabase = createServiceClient();
  await upsertGoogleConnection(supabase, {
    orgId: args.state.orgId,
    clientId: args.clientId,
    accessToken: args.tokenResponse.access_token,
    refreshToken: args.tokenResponse.refresh_token ?? null,
    expiresAt: computeExpiresAt(args.tokenResponse.expires_in),
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    scopes: args.tokenResponse.scope ?? null,
    connectedBy: args.state.userId,
  });
}

async function processCallback(code: string, stateToken: string): Promise<void> {
  const state = await verifyGoogleState(stateToken);
  const cfg = loadGoogleOAuthConfig();
  const tokenResponse = await exchangeGoogleCode({
    tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
    code,
    codeVerifier: state.codeVerifier,
    redirectUri: cfg.callbackUrl,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
  });
  await storeTokens({ state, clientId: cfg.clientId, tokenResponse });
}

function buildRedirectUrl(success: boolean): string {
  const webUrl = getRequiredEnv('WEB_URL');
  const status = success ? 'success' : 'error';
  return `${webUrl}?google_oauth=${status}`;
}

export async function handleGoogleCallback(req: Request, res: Response): Promise<void> {
  const code = getStringParam(req, 'code');
  const stateToken = getStringParam(req, 'state');

  if (code === undefined || stateToken === undefined) {
    res.redirect(buildRedirectUrl(false));
    return;
  }

  try {
    logOAuthInfo('google-callback', 'processing authorization code');
    await processCallback(code, stateToken);
    logOAuthInfo('google-callback', 'token exchange successful');
    res.redirect(buildRedirectUrl(true));
  } catch (err) {
    const message = extractErrorMessage(err);
    logOAuthError('google-callback', message);
    res.redirect(buildRedirectUrl(false));
  }
}
