'use client';

import type { ServerTenantStatus } from '@/app/lib/mcpTenantStatus';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { VariableValue } from '../VariableValuesEditor';
import { McpMatrixCell } from './McpMatrixCell';
import { type RowStatusIconKind, describeRowStatus } from './mcpMatrixRowLogic';

export interface McpMatrixRowProps {
  tenant: { id: string; name: string; isDefault: boolean };
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

function TenantLabel({ tenant }: { tenant: McpMatrixRowProps['tenant'] }) {
  const tTenants = useTranslations('tenants');
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {tenant.name}
      {tenant.isDefault && (
        <Badge variant="secondary" className="text-[0.625rem]">
          {tTenants('defaultLabel')}
        </Badge>
      )}
    </span>
  );
}

function RowStatus({ status }: { status: ServerTenantStatus }) {
  const t = useTranslations('mcpMatrix');
  const { labelKey, iconKind, colorClassName } = describeRowStatus(status);
  return (
    <span className="flex items-center gap-1.5 text-[0.625rem] text-muted-foreground">
      <RowStatusIcon kind={iconKind} className={colorClassName} />
      {t(labelKey)}
    </span>
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
  const t = useTranslations('mcpMatrix');
  return (
    <div className="flex flex-col gap-2 rounded-md border-[0.5px] bg-background px-3 py-2 dark:border-0">
      <div className="flex items-center justify-between">
        <TenantLabel tenant={tenant} />
        <div className="flex items-center gap-2">
          <RowStatus status={status} />
          <Button variant="outline" size="xs" onClick={onTest}>
            {t('test')}
          </Button>
        </div>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((variable) => (
          <McpMatrixCell
            key={variable}
            value={values[variable] ?? DEFAULT_VALUE}
            envVars={envVars}
            onChange={(value) => onCellChange(variable, value)}
          />
        ))}
      </div>
    </div>
  );
}
