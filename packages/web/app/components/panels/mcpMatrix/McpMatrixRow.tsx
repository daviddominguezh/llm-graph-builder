'use client';

import { TenantAvatar } from '@/app/components/agents/channels/TenantAvatar';
import type { ServerTenantStatus } from '@/app/lib/mcpTenantStatus';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
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
  envVars: OrgEnvVariableRow[];
  onCellChange: (variable: string, value: VariableValue) => void;
  onTest: () => void;
}

const DEFAULT_VALUE: VariableValue = { type: 'direct', value: '' };

function RowStatusIcon({ kind, className }: { kind: RowStatusIconKind; className: string }) {
  if (kind === 'ok') return <CheckCircle className={`size-3 ${className}`} />;
  if (kind === 'error') return <XCircle className={`size-3 ${className}`} />;
  return <AlertTriangle className={`size-3 ${className}`} />;
}

interface TenantCellProps {
  tenant: McpMatrixRowTenant;
  status: ServerTenantStatus;
  onTest: () => void;
}

function StatusActionRow({ status, onTest }: { status: ServerTenantStatus; onTest: () => void }) {
  const t = useTranslations('mcpMatrix');
  const { labelKey, iconKind, colorClassName } = describeRowStatus(status);
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
        <RowStatusIcon kind={iconKind} className={colorClassName} />
        {t(labelKey)}
      </span>
      <Button variant="outline" size="xs" onClick={onTest}>
        {t('test')}
      </Button>
    </div>
  );
}

function TenantCell({ tenant, status, onTest }: TenantCellProps) {
  const tTenants = useTranslations('tenants');
  return (
    <TableCell className="w-[200px] align-top">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <TenantAvatar name={tenant.name} avatarUrl={tenant.avatarUrl} small />
          <span className="truncate text-xs font-medium">{tenant.name}</span>
          {tenant.isDefault && (
            <span className="text-xs text-muted-foreground">{tTenants('defaultLabel')}</span>
          )}
        </div>
        <StatusActionRow status={status} onTest={onTest} />
      </div>
    </TableCell>
  );
}

export function McpMatrixRow({
  tenant,
  columns,
  values,
  status,
  envVars,
  onCellChange,
  onTest,
}: McpMatrixRowProps) {
  return (
    <TableRow>
      <TenantCell tenant={tenant} status={status} onTest={onTest} />
      {columns.map((variable) => (
        <TableCell key={variable} className="w-[150px] align-top">
          <McpMatrixCell
            value={values[variable] ?? DEFAULT_VALUE}
            envVars={envVars}
            onChange={(value) => onCellChange(variable, value)}
          />
        </TableCell>
      ))}
    </TableRow>
  );
}
