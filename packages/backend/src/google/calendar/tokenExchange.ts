import { z } from 'zod';

const GoogleTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  token_type: z.string(),
  scope: z.string().optional(),
});

export type GoogleTokenResponse = z.infer<typeof GoogleTokenResponseSchema>;

export interface GoogleExchangeParams {
  tokenEndpoint: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}

async function postTokenRequest(
  tokenEndpoint: string,
  params: Record<string, string>
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams(params);
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token request failed: ${String(res.status)} — ${text}`);
  }
  const raw: unknown = await res.json();
  return GoogleTokenResponseSchema.parse(raw);
}

export async function exchangeGoogleCode(params: GoogleExchangeParams): Promise<GoogleTokenResponse> {
  return await postTokenRequest(params.tokenEndpoint, {
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  });
}

export interface GoogleRefreshParams {
  tokenEndpoint: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

export async function refreshGoogleAccessToken(params: GoogleRefreshParams): Promise<GoogleTokenResponse> {
  return await postTokenRequest(params.tokenEndpoint, {
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    client_id: params.clientId,
    client_secret: params.clientSecret,
  });
}
