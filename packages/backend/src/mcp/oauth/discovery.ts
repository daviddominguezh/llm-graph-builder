import { z } from 'zod';

const OAuthMetadataSchema = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  registration_endpoint: z.string().optional(),
  scopes_supported: z.array(z.string()).optional(),
  response_types_supported: z.array(z.string()).optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
  revocation_endpoint: z.string().optional(),
});

export type OAuthMetadata = z.infer<typeof OAuthMetadataSchema>;

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
  const raw: unknown = await res.json();
  return OAuthMetadataSchema.parse(raw);
}
