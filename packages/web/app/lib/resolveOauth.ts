interface ResolveTokenResponse {
  accessToken?: string;
  error?: string;
}

function isResolveTokenResponse(value: unknown): value is ResolveTokenResponse {
  return typeof value === 'object' && value !== null;
}

export async function resolveOAuthToken(
  backendUrl: string,
  authHeader: string,
  orgId: string,
  libraryItemId: string
): Promise<string> {
  const res = await fetch(`${backendUrl}/agents/mcp-oauth/resolve-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({ orgId, libraryItemId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token resolution failed (${String(res.status)}): ${text}`);
  }

  const data: unknown = await res.json();
  if (!isResolveTokenResponse(data) || typeof data.accessToken !== 'string') {
    throw new Error('Invalid response from token resolution endpoint');
  }

  return data.accessToken;
}
