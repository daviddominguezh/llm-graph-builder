// Shared poolKey format mirrored in the backend (backend/src/mcp/pool/poolKey.ts).
// Kept here so the api-side client builds the identical key for the x-mcp-poolkey header.
// The api package CANNOT import the backend, so the format is duplicated, not imported.
export function buildPoolKeyFromParts(agentId: string, tenantId: string, mcpBindingId: string): string {
  return `${agentId}::${tenantId}::${mcpBindingId}`;
}
