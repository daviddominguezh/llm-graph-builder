import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('getTenantBySlug route contract', () => {
  it('stays two-arg (:orgId/:slug) for the dashboard', () => {
    const router = readFileSync(resolve(__dirname, 'tenantRouter.ts'), 'utf8');
    expect(router).toMatch(/by-slug\/:orgId\/:slug/);
  });
});
