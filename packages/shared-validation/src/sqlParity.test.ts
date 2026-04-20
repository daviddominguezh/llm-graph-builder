import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESERVED_TENANT_SLUGS, sortedReservedTenantSlugs } from './index.js';

const MIGRATIONS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../supabase/migrations',
);

function extractLatestReservedList(): string[] | null {
  // Scan newest-first; the last migration that defines tenants_slug_format wins.
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse();
  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
    if (!sql.includes('tenants_slug_format')) continue;
    const m = sql.match(/slug NOT IN \(\s*([\s\S]*?)\)/);
    const inner = m?.[1];
    if (!inner) continue;
    return (inner.match(/'([a-z0-9]+)'/g) ?? []).map((s) => s.slice(1, -1)).sort();
  }
  return null;
}

describe('reserved tenant slug parity', () => {
  it('TS list matches the Postgres CHECK literal in the latest tenants-slug migration', () => {
    const found = extractLatestReservedList();
    expect(found).not.toBeNull();
    expect(found).toEqual(sortedReservedTenantSlugs());
    expect(found!.length).toBe(RESERVED_TENANT_SLUGS.size);
  });
});
