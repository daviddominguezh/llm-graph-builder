import type { McpTenantConfigRow } from '@/app/lib/mcpTenantConfig';
import type { McpServerConfig, VariableValue } from '@daviddh/graph-types';
import { extractTemplateVariables } from '@daviddh/graph-types';

import type { VariableValue as LooseVariableValue } from '../VariableValuesEditor';

/** A tenant as the matrix modal renders it (one row each). */
export interface MatrixTenant {
  id: string;
  name: string;
  isDefault: boolean;
  avatarUrl: string | null;
}

/**
 * Auto-detected columns for the server's transport. OAuth/library servers whose
 * transport carries no `{{placeholder}}` yield an empty list — the modal then
 * renders status-only rows (no value cells).
 */
export function buildMatrixColumns(server: McpServerConfig): string[] {
  return extractTemplateVariables(server.transport);
}

/** A custom (non-library) server exposes the transport-template editor. */
export function isCustomServer(server: McpServerConfig): boolean {
  return server.libraryItemId === undefined;
}

/** Default tenant always renders as the first row; the rest keep their order. */
export function orderTenantsDefaultFirst(tenants: MatrixTenant[]): MatrixTenant[] {
  const defaults = tenants.filter((t) => t.isDefault);
  const others = tenants.filter((t) => !t.isDefault);
  return [...defaults, ...others];
}

/** The persisted variable values for one (server, tenant) cell, or empty. */
export function valuesForTenant(
  rows: McpTenantConfigRow[],
  serverId: string,
  tenantId: string
): Record<string, VariableValue> {
  const row = rows.find((r) => r.server_id === serverId && r.tenant_id === tenantId);
  return row?.variable_values ?? {};
}

/**
 * Narrow the structurally-loose editor `VariableValue` (from VariableValuesEditor)
 * back to the canonical graph-types discriminated union before persisting, so the
 * matrix row's `onCellChange` value is type-safe to feed into `saveCell`.
 */
export function toCanonicalVariableValue(value: LooseVariableValue): VariableValue {
  if (value.type === 'env_ref') {
    return { type: 'env_ref', envVariableId: value.envVariableId ?? '' };
  }
  return { type: 'direct', value: value.value ?? '' };
}

/** Merge a single changed variable into a cell's existing value map. */
export function mergeCellValue(
  current: Record<string, VariableValue>,
  variable: string,
  value: LooseVariableValue
): Record<string, VariableValue> {
  return { ...current, [variable]: toCanonicalVariableValue(value) };
}
