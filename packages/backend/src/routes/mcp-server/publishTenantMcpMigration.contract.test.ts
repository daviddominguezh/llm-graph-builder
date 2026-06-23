import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const d = dirname(fileURLToPath(import.meta.url));
const M = resolve(d, '../../../../../supabase/migrations/20260623100000_publish_tenant_mcp_config.sql');

describe('publish_tenant_mcp_config migration', () => {
  const sql = readFileSync(M, 'utf8');
  it('redefines both publish RPCs', () => {
    expect(sql).toMatch(/create or replace function public\.publish_version_tx/iv);
    expect(sql).toMatch(/create or replace function public\.publish_agent_version_tx/iv);
  });
  it('snapshots per-tenant mcp config in both', () => {
    const BOTH_RPCS = 2;
    const occurrences = sql.match(/'mcpTenantConfig'/gv) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(BOTH_RPCS);
    expect(sql).toMatch(/from public\.graph_mcp_server_tenant_config/iv);
  });
  it('agent RPC now embeds variableValues + libraryItemId', () => {
    expect(sql).toMatch(/'variableValues', m\.variable_values/iv);
    expect(sql).toMatch(/'libraryItemId', m\.library_item_id/iv);
  });
});
