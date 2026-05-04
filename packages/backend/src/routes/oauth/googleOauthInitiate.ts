import type { Request } from 'express';

import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_TOKEN_ENDPOINT,
  loadGoogleOAuthConfig,
} from '../../google/calendar/oauthConfig.js';
import { signGoogleState } from '../../google/calendar/stateJwt.js';
import { computeCodeChallenge, generateCodeVerifier } from '../../mcp/oauth/pkce.js';
import type { AuthenticatedLocals, AuthenticatedResponse } from '../routeHelpers.js';
import { HTTP_OK } from '../routeHelpers.js';
import {
  extractErrorMessage,
  logOAuthError,
  logOAuthInfo,
  sendBadRequest,
  sendInternalError,
} from './oauthHelpers.js';

interface InitiateBody {
  orgId?: string;
}

interface AuthorizeUrlParts {
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
    scope: GOOGLE_CALENDAR_SCOPES,
    code_challenge: parts.codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    state: parts.stateToken,
    include_granted_scopes: 'true',
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

async function generateInitiateUrl(orgId: string, userId: string): Promise<string> {
  const cfg = loadGoogleOAuthConfig();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = computeCodeChallenge(codeVerifier);
  const stateToken = await signGoogleState({ orgId, userId, codeVerifier });
  // tokenEndpoint is recorded at connection creation time for forward compatibility.
  void GOOGLE_TOKEN_ENDPOINT;
  return buildAuthorizeUrl({
    clientId: cfg.clientId,
    callbackUrl: cfg.callbackUrl,
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
  return { orgId: extractStringField(body, 'orgId') };
}

export async function handleGoogleInitiate(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { orgId } = parseInitiateBody(req.body);
  const { userId }: AuthenticatedLocals = res.locals;

  if (orgId === undefined) {
    sendBadRequest(res, 'orgId is required');
    return;
  }

  try {
    logOAuthInfo('google-initiate', `orgId=${orgId}`);
    const authorizeUrl = await generateInitiateUrl(orgId, userId);
    res.status(HTTP_OK).json({ authorizeUrl });
  } catch (err) {
    const message = extractErrorMessage(err);
    logOAuthError('google-initiate', message);
    sendInternalError(res, message);
  }
}
