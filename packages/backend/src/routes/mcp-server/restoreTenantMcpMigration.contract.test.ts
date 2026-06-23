import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDir = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(
  thisDir,
  '../../../../../supabase/migrations/20260623200000_restore_tenant_mcp_config.sql'
);

describe('restore_tenant_mcp_config migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('redefines restore_version_tx', () => {
    expect(sql).toMatch(/create or replace function public\.restore_version_tx/iv);
  });

  it('restores variable_values + library_item_id onto graph_mcp_servers', () => {
    expect(sql).toMatch(/insert into public\.graph_mcp_servers/iv);
    expect(sql).toMatch(/variable_values/iv);
    expect(sql).toMatch(/library_item_id/iv);
    expect(sql).toMatch(/v_server->'variableValues'/iv);
    expect(sql).toMatch(/v_server->>'libraryItemId'/iv);
  });

  it('repopulates graph_mcp_server_tenant_config from the snapshot', () => {
    expect(sql).toMatch(/insert into public\.graph_mcp_server_tenant_config/iv);
    expect(sql).toMatch(/jsonb_array_elements\(v_snapshot->'mcpTenantConfig'\)/iv);
    expect(sql).toMatch(/v_tenant_cfg->>'serverId'/iv);
    expect(sql).toMatch(/v_tenant_cfg->>'tenantId'/iv);
    expect(sql).toMatch(/v_tenant_cfg->'variableValues'/iv);
  });
});
