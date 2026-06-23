import type { ServerAggregateStatus } from '@/app/lib/mcpTenantConfig';

import type { MatrixTenant } from './mcpMatrix/mcpMatrixModalLogic';

/**
 * A tenant as the section receives it (carries the SP1 `isDefault` flag).
 * The matrix modal needs `{ id, name, isDefault }`; this is the input shape.
 */
export interface SectionTenant {
  id: string;
  name: string;
  isDefault: boolean;
}

/**
 * Map the section's tenants into the matrix modal's `MatrixTenant` shape.
 * Pure so it is unit-testable in the node-env (no jsdom) Jest setup.
 */
export function toMatrixTenants(tenants: SectionTenant[]): MatrixTenant[] {
  return tenants.map((tenant) => ({ id: tenant.id, name: tenant.name, isDefault: tenant.isDefault }));
}

export type AggregateIconKind = 'ok' | 'warning' | 'error';

export interface AggregateStatusDescriptor {
  // Which icon glyph the row should render.
  iconKind: AggregateIconKind;
  // Tailwind color token for the icon (no `!important`).
  colorClassName: string;
}

const AGGREGATE_DESCRIPTORS: Record<ServerAggregateStatus, AggregateStatusDescriptor> = {
  ok: { iconKind: 'ok', colorClassName: 'text-green-500' },
  warning: { iconKind: 'warning', colorClassName: 'text-orange-400' },
  error: { iconKind: 'error', colorClassName: 'text-destructive' },
};

/**
 * Pure aggregate-status -> presentation mapping so the icon/color choice is
 * unit-testable without rendering the React component.
 */
export function describeAggregateStatus(status: ServerAggregateStatus): AggregateStatusDescriptor {
  return AGGREGATE_DESCRIPTORS[status];
}
