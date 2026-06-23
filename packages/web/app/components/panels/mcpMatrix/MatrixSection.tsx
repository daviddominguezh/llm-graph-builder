'use client';

import type { UseMcpTenantConfigsResult } from '@/app/hooks/useMcpTenantConfigs';
import type { ServerTenantStatus } from '@/app/lib/mcpTenantStatus';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import type { McpServerConfig } from '@/app/schemas/graph.schema';
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

// Header cells share the muted/semibold look + bottom divider. Frozen header
// cells use z-20 so they stay above the body's z-10 sticky cells when scrolled.
const HEADER_CELL = 'px-2 py-1.5 border-b font-semibold text-muted-foreground';
const HEADER_FROZEN_LEFT = 'sticky left-0 z-20 border-r bg-popover';
const HEADER_FROZEN_RIGHT = 'sticky right-0 z-20 border-l bg-popover';

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

function MatrixHeaderCells({ columns }: { columns: string[] }) {
  const t = useTranslations('mcpMatrix');
  return (
    <>
      <div className={`${HEADER_CELL} ${HEADER_FROZEN_LEFT}`}>{t('tenantColumn')}</div>
      {columns.map((variable) => (
        <div key={variable} className={`${HEADER_CELL} font-mono text-[11px]`}>
          {`{{${variable}}}`}
        </div>
      ))}
      <div className={`${HEADER_CELL} ${HEADER_FROZEN_RIGHT}`}>{t('statusColumn')}</div>
    </>
  );
}

function MatrixGrid(props: MatrixSectionProps) {
  const gridStyle = {
    gridTemplateColumns: `200px repeat(${props.columns.length}, 150px) 180px`,
  };
  return (
    <div data-native-scroll className="overflow-x-auto">
      <div className="grid w-max text-xs" style={gridStyle}>
        <MatrixHeaderCells columns={props.columns} />
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
      </div>
    </div>
  );
}

export function MatrixSection(props: MatrixSectionProps) {
  if (props.config.loading) return <LoadingBody />;
  if (props.tenants.length === 0) return <EmptyTenants />;
  return (
    <section className="flex flex-col gap-2">
      {props.columns.length === 0 && <OAuthNote />}
      <MatrixGrid {...props} />
    </section>
  );
}
