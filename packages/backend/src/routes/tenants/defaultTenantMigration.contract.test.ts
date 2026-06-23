import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const thisDir = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(thisDir, '../../../../../supabase/migrations/20260622000000_tenants_default.sql');

describe('tenants_default migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('adds is_default column idempotently', () => {
    expect(sql).toMatch(/add column if not exists is_default boolean not null default false/iv);
  });
  it('creates one-default-per-org partial unique index', () => {
    expect(sql).toMatch(/create unique index if not exists tenants_one_default_per_org/iv);
    expect(sql).toMatch(/where is_default/iv);
  });
  it('defines the AFTER INSERT trigger on organizations', () => {
    expect(sql).toMatch(
      /create trigger on_org_created_default_tenant\s+after insert on public\.organizations/iv
    );
  });
  it('gates the update guard on the mirror GUC and the delete guard on the bypass GUC', () => {
    expect(sql).toMatch(/app\.mirror_default_tenant/v);
    expect(sql).toMatch(/app\.allow_default_tenant_delete/v);
  });
  it('sets GUCs inside SECURITY DEFINER RPCs via set_config(..., true)', () => {
    expect(sql).toMatch(/set_config\('app\.mirror_default_tenant', 'on', true\)/v);
    expect(sql).toMatch(/set_config\('app\.allow_default_tenant_delete', 'on', true\)/v);
  });
  it('backfills idempotently and promotes a pre-existing same-named tenant', () => {
    expect(sql).toMatch(/not exists \(select 1 from public\.tenants/iv);
    expect(sql).toMatch(/set is_default = true/iv);
  });
});
