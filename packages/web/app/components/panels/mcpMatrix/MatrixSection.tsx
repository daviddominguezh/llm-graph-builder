'use client';

import type { UseMcpTenantConfigsResult } from '@/app/hooks/useMcpTenantConfigs';
import type { ServerTenantStatus } from '@/app/lib/mcpTenantStatus';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import type { McpServerConfig } from '@/app/schemas/graph.schema';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { VariableValue } from '../VariableValuesEditor';
import { McpMatrixRow } from './McpMatrixRow';
import type { MatrixTenant } from './mcpMatrixModalLogic';

type VariableMap = Record<string, VariableValue>;

export interface MatrixSectionProps {
  server: McpServerConfig;
  tenants: MatrixTenant[];
  columns: string[];
  envVariables: OrgEnvVariableRow[];
  config: UseMcpTenantConfigsResult;
  statusFor: (tenantId: string) => ServerTenantStatus;
  valuesFor: (tenantId: string) => VariableMap;
  onTest: () => void;
  onCellChange: (tenantId: string, variable: string, value: VariableValue) => void;
}

function LoadingBody() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyTenants() {
  const t = useTranslations('mcpMatrix');
  return <p className="py-6 text-center text-xs text-muted-foreground">{t('emptyTenants')}</p>;
}

function OAuthNote() {
  const t = useTranslations('mcpMatrix');
  return <p className="text-xs text-muted-foreground">{t('oauthStatusOnly')}</p>;
}

function MatrixHeader({ columns }: { columns: string[] }) {
  const t = useTranslations('mcpMatrix');
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-[200px]">{t('tenantColumn')}</TableHead>
        {columns.map((variable) => (
          <TableHead key={variable} className="w-[150px] font-mono text-[11px]">
            {`{{${variable}}}`}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

function MatrixRows(props: MatrixSectionProps) {
  return (
    <TableBody>
      {props.tenants.map((tenant) => (
        <McpMatrixRow
          key={tenant.id}
          tenant={tenant}
          columns={props.columns}
          values={props.valuesFor(tenant.id)}
          status={props.statusFor(tenant.id)}
          envVars={props.envVariables}
          onCellChange={(variable, value) => props.onCellChange(tenant.id, variable, value)}
          onTest={props.onTest}
        />
      ))}
    </TableBody>
  );
}

export function MatrixSection(props: MatrixSectionProps) {
  if (props.config.loading) return <LoadingBody />;
  if (props.tenants.length === 0) return <EmptyTenants />;
  return (
    <section className="flex flex-col gap-2">
      {props.columns.length === 0 && <OAuthNote />}
      <Table className="w-auto">
        <MatrixHeader columns={props.columns} />
        <MatrixRows {...props} />
      </Table>
    </section>
  );
}
