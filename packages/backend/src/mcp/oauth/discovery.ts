export interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  revocation_endpoint?: string;
}

function buildWellKnownUrl(mcpServerUrl: string): string {
  const parsed = new URL(mcpServerUrl);
  return `${parsed.origin}/.well-known/oauth-authorization-server${parsed.pathname}`;
}

export async function discoverOAuthMetadata(mcpServerUrl: string): Promise<OAuthMetadata> {
  const wellKnownUrl = buildWellKnownUrl(mcpServerUrl);
  const res = await fetch(wellKnownUrl);
  if (!res.ok) {
    throw new Error(`OAuth discovery failed: ${String(res.status)} from ${wellKnownUrl}`);
  }
  return (await res.json()) as OAuthMetadata;
}
