import { z } from 'zod';

const TokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  token_type: z.string(),
  scope: z.string().optional(),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

interface ClientCredentials {
  clientId: string;
  clientSecret?: string;
  authMethod?: string;
}

function buildAuthHeaders(creds: ClientCredentials): Record<string, string> {
  if (creds.authMethod !== 'client_secret_basic' || creds.clientSecret === undefined) {
    return {};
  }
  const encoded = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  return { Authorization: `Basic ${encoded}` };
}

function buildAuthBody(creds: ClientCredentials): Record<string, string> {
  if (creds.authMethod === 'client_secret_basic') {
    return {};
  }
  const body: Record<string, string> = { client_id: creds.clientId };
  if (creds.clientSecret !== undefined) {
    const { clientSecret } = creds;
    body.client_secret = clientSecret;
  }
  return body;
}

async function postTokenRequest(
  tokenEndpoint: string,
  params: Record<string, string>,
  creds: ClientCredentials
): Promise<TokenResponse> {
  const body = new URLSearchParams({ ...params, ...buildAuthBody(creds) });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', ...buildAuthHeaders(creds) };
  const res = await fetch(tokenEndpoint, { method: 'POST', headers, body: body.toString() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed: ${String(res.status)} — ${text}`);
  }
  const raw: unknown = await res.json();
  return TokenResponseSchema.parse(raw);
}

export interface ExchangeCodeParams {
  tokenEndpoint: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  resourceUrl: string;
  creds: ClientCredentials;
}

export async function exchangeCode(params: ExchangeCodeParams): Promise<TokenResponse> {
  const { tokenEndpoint, code, codeVerifier, redirectUri, resourceUrl, creds } = params;
  return await postTokenRequest(
    tokenEndpoint,
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      resource: resourceUrl,
    },
    creds
  );
}

export async function refreshAccessToken(
  tokenEndpoint: string,
  refreshToken: string,
  resourceUrl: string,
  creds: ClientCredentials
): Promise<TokenResponse> {
  return await postTokenRequest(
    tokenEndpoint,
    { grant_type: 'refresh_token', refresh_token: refreshToken, resource: resourceUrl },
    creds
  );
}
