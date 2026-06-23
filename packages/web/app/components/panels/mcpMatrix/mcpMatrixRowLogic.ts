import type { ServerTenantStatus } from '@/app/lib/mcpTenantStatus';

export type RowStatusIconKind = 'ok' | 'pending' | 'error';

export interface RowStatusDescriptor {
  // i18n key inside the `mcpMatrix` namespace describing the status.
  labelKey: 'statusOk' | 'statusPending' | 'statusError';
  // Which icon glyph the row should render.
  iconKind: RowStatusIconKind;
  // Tailwind color token for the icon (no `!important`).
  colorClassName: string;
}

const DESCRIPTORS: Record<ServerTenantStatus, RowStatusDescriptor> = {
  ok: { labelKey: 'statusOk', iconKind: 'ok', colorClassName: 'text-green-500' },
  pending: { labelKey: 'statusPending', iconKind: 'pending', colorClassName: 'text-orange-400' },
  error: { labelKey: 'statusError', iconKind: 'error', colorClassName: 'text-destructive' },
};

// Pure status -> presentation mapping so the icon/label choice is unit-testable
// without rendering the (node-env, no-jsdom) React component.
export function describeRowStatus(status: ServerTenantStatus): RowStatusDescriptor {
  return DESCRIPTORS[status];
}
