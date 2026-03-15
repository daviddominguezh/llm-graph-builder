export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}

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
    body['client_secret'] = creds.clientSecret;
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
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(
  tokenEndpoint: string,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  resourceUrl: string,
  creds: ClientCredentials
): Promise<TokenResponse> {
  return postTokenRequest(
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
  return postTokenRequest(
    tokenEndpoint,
    { grant_type: 'refresh_token', refresh_token: refreshToken, resource: resourceUrl },
    creds
  );
}
