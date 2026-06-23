'use client';

import { TenantAvatar } from '@/app/components/agents/channels/TenantAvatar';
import type { ServerTenantStatus } from '@/app/lib/mcpTenantStatus';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { VariableValue } from '../VariableValuesEditor';
import { McpMatrixCell } from './McpMatrixCell';
import { type RowStatusIconKind, describeRowStatus } from './mcpMatrixRowLogic';

export interface McpMatrixRowTenant {
  id: string;
  name: string;
  isDefault: boolean;
  avatarUrl: string | null;
}

export interface McpMatrixRowProps {
  tenant: McpMatrixRowTenant;
  columns: string[];
  values: Record<string, VariableValue>;
  status: ServerTenantStatus;
  verifying: boolean;
  envVars: OrgEnvVariableRow[];
  onCellChange: (variable: string, value: VariableValue) => void;
  onTest: () => void;
}

const DEFAULT_VALUE: VariableValue = { type: 'direct', value: '' };

// Sticky frozen first column (Tenant) — opaque bg-popover so scrolled variable
// cells don't bleed through; z-10 keeps it above the scrolling middle.
const FROZEN_LEFT = 'sticky left-0 z-10 bg-popover';
// Sticky frozen last column (Status).
const FROZEN_RIGHT = 'sticky right-0 z-10 bg-popover';
const CELL_PADDING = 'px-2 py-1.5';
// Single-line full grid: every cell carries bottom + right borders; the grid
// container adds the top + left edges.
const CELL_BORDER = 'border-b border-r';

function RowStatusIcon({ kind, className }: { kind: RowStatusIconKind; className: string }) {
  if (kind === 'ok') return <CheckCircle className={`size-3 ${className}`} />;
  if (kind === 'error') return <XCircle className={`size-3 ${className}`} />;
  return <AlertTriangle className={`size-3 ${className}`} />;
}

function TenantCell({ tenant }: { tenant: McpMatrixRowTenant }) {
  const tTenants = useTranslations('tenants');
  return (
    <div className={`${FROZEN_LEFT} ${CELL_BORDER} ${CELL_PADDING} flex items-center gap-2`}>
      <TenantAvatar name={tenant.name} avatarUrl={tenant.avatarUrl} small />
      <span className="truncate text-xs font-medium">{tenant.name}</span>
      {tenant.isDefault && <span className="text-xs text-muted-foreground">{tTenants('defaultLabel')}</span>}
    </div>
  );
}

interface StatusCellProps {
  status: ServerTenantStatus;
  verifying: boolean;
  onTest: () => void;
}

function StatusCell({ status, verifying, onTest }: StatusCellProps) {
  const t = useTranslations('mcpMatrix');
  const { labelKey, iconKind, colorClassName } = describeRowStatus(status);
  return (
    <div className={`${FROZEN_RIGHT} ${CELL_BORDER} ${CELL_PADDING} flex flex-col items-start justify-center gap-1`}>
      <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
        <RowStatusIcon kind={iconKind} className={colorClassName} />
        {t(labelKey)}
      </span>
      <Button variant="outline" size="xs" onClick={onTest} disabled={verifying}>
        {verifying ? <Loader2 className="size-3 animate-spin" /> : t('test')}
      </Button>
    </div>
  );
}

export function McpMatrixRow({
  tenant,
  columns,
  values,
  status,
  verifying,
  envVars,
  onCellChange,
  onTest,
}: McpMatrixRowProps) {
  return (
    <>
      <TenantCell tenant={tenant} />
      {columns.map((variable) => (
        <div key={variable} className={`${CELL_BORDER} ${CELL_PADDING} items-start`}>
          <McpMatrixCell
            value={values[variable] ?? DEFAULT_VALUE}
            envVars={envVars}
            onChange={(value) => onCellChange(variable, value)}
          />
        </div>
      ))}
      <div aria-hidden className={CELL_BORDER} />
      <StatusCell status={status} verifying={verifying} onTest={onTest} />
    </>
  );
}
