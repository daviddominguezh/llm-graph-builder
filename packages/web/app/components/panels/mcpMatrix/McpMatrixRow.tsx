'use client';

import { TenantAvatar } from '@/app/components/agents/channels/TenantAvatar';
import type { ServerTenantStatus } from '@/app/lib/mcpTenantStatus';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle, Loader2, RotateCw, XCircle } from 'lucide-react';
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
// cells don't bleed through; z-10 keeps it above the scrolling middle. border-r
// carries the divider on the cell itself, since the grid gap-line between it and
// the variables scrolls away/under the pinned column.
const FROZEN_LEFT = 'sticky left-0 z-10 border-r bg-popover';
// Two frozen right columns (offsets must match MatrixSection): Status sits left
// of the 72px Action column, offset by the Action width + the 1px grid gap.
// border-l carries the divider (the gap-line scrolls under the pinned column).
const FROZEN_STATUS = 'sticky right-[73px] z-10 border-l bg-popover';
const FROZEN_ACTION = 'sticky right-0 z-10 bg-popover';
const CELL_PADDING = 'px-3 py-2.5';
// Gap-as-border grid: every cell carries an opaque bg-popover so the grid
// container's 1px gaps reveal bg-border as clean single grid lines, and the
// container's single rounded border frames the whole matrix.
const CELL_BG = 'bg-popover';

function RowStatusIcon({ kind, className }: { kind: RowStatusIconKind; className: string }) {
  if (kind === 'ok') return <CheckCircle className={`size-3.5 ${className}`} />;
  if (kind === 'error') return <XCircle className={`size-3.5 ${className}`} />;
  return <AlertTriangle className={`size-3.5 ${className}`} />;
}

function TenantCell({ tenant }: { tenant: McpMatrixRowTenant }) {
  const tTenants = useTranslations('tenants');
  return (
    <div className={`${FROZEN_LEFT} ${CELL_PADDING} flex items-center gap-2`}>
      <TenantAvatar name={tenant.name} avatarUrl={tenant.avatarUrl} small />
      <span className="truncate text-xs font-medium">{tenant.name}</span>
      {tenant.isDefault && <span className="text-xs text-muted-foreground">{tTenants('defaultLabel')}</span>}
    </div>
  );
}

function StatusCell({ status }: { status: ServerTenantStatus }) {
  const t = useTranslations('mcpMatrix');
  const { labelKey, iconKind, colorClassName } = describeRowStatus(status);
  return (
    <div className={`${FROZEN_STATUS} ${CELL_PADDING} flex items-center`}>
      <span className="flex items-center gap-1 text-xs text-foreground">
        <RowStatusIcon kind={iconKind} className={colorClassName} />
        {t(labelKey)}
      </span>
    </div>
  );
}

interface ActionCellProps {
  verifying: boolean;
  onTest: () => void;
}

function ActionCell({ verifying, onTest }: ActionCellProps) {
  const t = useTranslations('mcpMatrix');
  return (
    <div className={`${FROZEN_ACTION} ${CELL_PADDING} flex items-center justify-center`}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              aria-label={t('test')}
              disabled={verifying}
              onClick={onTest}
            />
          }
        >
          {verifying ? <Loader2 className="animate-spin" /> : <RotateCw />}
        </TooltipTrigger>
        <TooltipContent side="top">{t('testHint')}</TooltipContent>
      </Tooltip>
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
        <div key={variable} className={`${CELL_BG} ${CELL_PADDING} items-start`}>
          <McpMatrixCell
            value={values[variable] ?? DEFAULT_VALUE}
            envVars={envVars}
            onChange={(value) => onCellChange(variable, value)}
          />
        </div>
      ))}
      <StatusCell status={status} />
      <ActionCell verifying={verifying} onTest={onTest} />
    </>
  );
}
