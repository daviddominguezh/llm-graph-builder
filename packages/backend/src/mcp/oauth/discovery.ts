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

function buildWellKnownUrls(mcpServerUrl: string): string[] {
  const parsed = new URL(mcpServerUrl);
  const withPath = `${parsed.origin}/.well-known/oauth-authorization-server${parsed.pathname}`;
  const rootOnly = `${parsed.origin}/.well-known/oauth-authorization-server`;
  return parsed.pathname === '/' ? [rootOnly] : [withPath, rootOnly];
}

async function fetchMetadata(url: string): Promise<OAuthMetadata | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const raw: unknown = await res.json();
  return OAuthMetadataSchema.parse(raw);
}

export async function discoverOAuthMetadata(mcpServerUrl: string): Promise<OAuthMetadata> {
  const [primary, fallback] = buildWellKnownUrls(mcpServerUrl);
  if (primary === undefined) throw new Error(`OAuth discovery failed for ${mcpServerUrl}`);

  const metadata = await fetchMetadata(primary);
  if (metadata !== null) return metadata;

  if (fallback === undefined) throw new Error(`OAuth discovery failed for ${mcpServerUrl}`);
  const fallbackMetadata = await fetchMetadata(fallback);
  if (fallbackMetadata !== null) return fallbackMetadata;

  throw new Error(`OAuth discovery failed for ${mcpServerUrl}`);
}
