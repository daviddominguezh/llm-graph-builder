import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDir = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(thisDir, '../../../../../supabase/migrations/20260623010000_mcp_tenant_config.sql');

describe('mcp_tenant_config migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('creates the two tables idempotently', () => {
    expect(sql).toMatch(/create table if not exists public\.graph_mcp_server_tenant_config/iv);
    expect(sql).toMatch(/create table if not exists public\.graph_mcp_server_tenant_discovery/iv);
  });
  it('config table has the composite FK to graph_mcp_servers', () => {
    expect(sql).toMatch(/references public\.graph_mcp_servers \(agent_id, server_id\) on delete cascade/iv);
  });
  it('config table has the per-(agent,server,tenant) unique key', () => {
    expect(sql).toMatch(/unique \(agent_id, server_id, tenant_id\)/iv);
  });
  it('discovery status is constrained to pending|ok|error', () => {
    expect(sql).toMatch(/check \(status in \('pending', 'ok', 'error'\)\)/iv);
  });
  it('enables RLS and uses the recursion-safe is_org_member', () => {
    expect(sql).toMatch(/enable row level security/iv);
    expect(sql).toMatch(/public\.is_org_member/iv);
  });
  it('backfills config rows coalescing null variable_values to empty object', () => {
    expect(sql).toMatch(/coalesce\(m\.variable_values, '\{\}'::jsonb\)/iv);
  });
});
