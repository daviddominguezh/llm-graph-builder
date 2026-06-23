import type { McpTenantConfigRow } from '@/app/lib/mcpTenantConfig';
import type { McpServerConfig } from '@daviddh/graph-types';
import { describe, expect, it } from '@jest/globals';

import {
  type MatrixTenant,
  buildMatrixColumns,
  isCustomServer,
  mergeCellValue,
  orderTenantsDefaultFirst,
  toCanonicalVariableValue,
  valuesForTenant,
} from '../mcpMatrixModalLogic';

function server(overrides: Partial<McpServerConfig>): McpServerConfig {
  return {
    id: 's1',
    name: 'svc',
    transport: { type: 'http', url: 'https://{{HOST}}/mcp' },
    enabled: true,
    ...overrides,
  };
}

const tenants: MatrixTenant[] = [
  { id: 't-a', name: 'Acme', isDefault: false, avatarUrl: null },
  { id: 't-def', name: 'Default', isDefault: true, avatarUrl: null },
  { id: 't-b', name: 'Beta', isDefault: false, avatarUrl: null },
];

describe('buildMatrixColumns', () => {
  it('derives columns from the transport placeholders', () => {
    expect(buildMatrixColumns(server({}))).toEqual(['HOST']);
  });

  it('returns no columns for an OAuth/library server with a literal url', () => {
    const oauth = server({
      libraryItemId: 'lib-1',
      transport: { type: 'http', url: 'https://api.example.com/mcp' },
    });
    expect(buildMatrixColumns(oauth)).toEqual([]);
  });
});

describe('isCustomServer', () => {
  it('is true when there is no library item', () => {
    expect(isCustomServer(server({}))).toBe(true);
  });

  it('is false for a library-sourced server', () => {
    expect(isCustomServer(server({ libraryItemId: 'lib-1' }))).toBe(false);
  });
});

describe('orderTenantsDefaultFirst', () => {
  it('places the default tenant first and preserves the rest', () => {
    expect(orderTenantsDefaultFirst(tenants).map((t) => t.id)).toEqual(['t-def', 't-a', 't-b']);
  });

  it('is a no-op when there is no default', () => {
    const noDefault = tenants.filter((t) => !t.isDefault);
    expect(orderTenantsDefaultFirst(noDefault).map((t) => t.id)).toEqual(['t-a', 't-b']);
  });
});

describe('valuesForTenant', () => {
  const rows: McpTenantConfigRow[] = [
    {
      agent_id: 'a1',
      server_id: 's1',
      tenant_id: 't-def',
      variable_values: { HOST: { type: 'direct', value: 'h.example.com' } },
      updated_at: '2026-06-23T00:00:00Z',
    },
  ];

  it('returns the matching cell values', () => {
    expect(valuesForTenant(rows, 's1', 't-def')).toEqual({
      HOST: { type: 'direct', value: 'h.example.com' },
    });
  });

  it('returns an empty object when no row matches', () => {
    expect(valuesForTenant(rows, 's1', 't-a')).toEqual({});
  });
});

describe('toCanonicalVariableValue', () => {
  it('narrows a direct value, defaulting a missing value to empty string', () => {
    expect(toCanonicalVariableValue({ type: 'direct' })).toEqual({ type: 'direct', value: '' });
  });

  it('narrows an env_ref value, defaulting a missing id to empty string', () => {
    expect(toCanonicalVariableValue({ type: 'env_ref' })).toEqual({
      type: 'env_ref',
      envVariableId: '',
    });
  });
});

describe('mergeCellValue', () => {
  it('merges one changed variable into the existing map', () => {
    const current = { HOST: { type: 'direct' as const, value: 'old' } };
    expect(mergeCellValue(current, 'TOKEN', { type: 'direct', value: 't' })).toEqual({
      HOST: { type: 'direct', value: 'old' },
      TOKEN: { type: 'direct', value: 't' },
    });
  });
});
