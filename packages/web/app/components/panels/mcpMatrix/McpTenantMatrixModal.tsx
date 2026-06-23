'use client';

import { type UseMcpTenantConfigsResult, useMcpTenantConfigs } from '@/app/hooks/useMcpTenantConfigs';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import type { McpServerConfig, McpTransport } from '@/app/schemas/graph.schema';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Scrollable } from '../../Scrollable';
import { McpMatrixRow } from './McpMatrixRow';
import { McpServerDefinitionSection } from './McpServerDefinitionSection';
import {
  type MatrixTenant,
  buildMatrixColumns,
  isCustomServer,
  mergeCellValue,
  orderTenantsDefaultFirst,
  valuesForTenant,
} from './mcpMatrixModalLogic';

export interface McpTenantMatrixModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: McpServerConfig;
  agentId: string;
  tenants: MatrixTenant[];
  envVariables: OrgEnvVariableRow[];
  onTransportChange?: (transport: McpTransport) => void;
}

function LoadingBody() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyBody() {
  const t = useTranslations('mcpMatrix');
  return <p className="py-6 text-center text-xs text-muted-foreground">{t('emptyTenants')}</p>;
}

function OAuthNote() {
  const t = useTranslations('mcpMatrix');
  return <p className="text-xs text-muted-foreground">{t('oauthStatusOnly')}</p>;
}

interface RowsListProps {
  server: McpServerConfig;
  tenants: MatrixTenant[];
  columns: string[];
  envVariables: OrgEnvVariableRow[];
  config: UseMcpTenantConfigsResult;
}

function RowsList({ server, tenants, columns, envVariables, config }: RowsListProps) {
  return (
    <div className="flex flex-col gap-2">
      {columns.length === 0 && <OAuthNote />}
      {tenants.map((tenant) => {
        const values = valuesForTenant(config.rows, server.id, tenant.id);
        return (
          <McpMatrixRow
            key={tenant.id}
            tenant={tenant}
            columns={columns}
            values={values}
            status={config.statusFor(server.id, tenant.id)}
            envVars={envVariables}
            onCellChange={(variable, value) =>
              void config.saveCell(server.id, tenant.id, mergeCellValue(values, variable, value))
            }
            onTest={() => void config.verifyServer(server.id)}
          />
        );
      })}
    </div>
  );
}

interface MatrixBodyProps {
  server: McpServerConfig;
  tenants: MatrixTenant[];
  columns: string[];
  envVariables: OrgEnvVariableRow[];
  config: UseMcpTenantConfigsResult;
  transport: McpTransport;
  onTransportChange: (transport: McpTransport) => void;
}

function MatrixBody(props: MatrixBodyProps) {
  const { server, tenants, columns, envVariables, config, transport, onTransportChange } = props;
  return (
    <div className="flex flex-col gap-3">
      {isCustomServer(server) && (
        <McpServerDefinitionSection transport={transport} onTemplateChange={onTransportChange} />
      )}
      {renderBody(config.loading, tenants, columns, envVariables, server, config)}
    </div>
  );
}

function renderBody(
  loading: boolean,
  tenants: MatrixTenant[],
  columns: string[],
  envVariables: OrgEnvVariableRow[],
  server: McpServerConfig,
  config: UseMcpTenantConfigsResult
) {
  if (loading) return <LoadingBody />;
  if (tenants.length === 0) return <EmptyBody />;
  return (
    <Scrollable className="max-h-[60vh]">
      <RowsList
        server={server}
        tenants={tenants}
        columns={columns}
        envVariables={envVariables}
        config={config}
      />
    </Scrollable>
  );
}

interface MatrixContentProps {
  server: McpServerConfig;
  agentId: string;
  tenants: MatrixTenant[];
  envVariables: OrgEnvVariableRow[];
  transport: McpTransport;
  onTransportChange: (transport: McpTransport) => void;
}

function MatrixContent(props: MatrixContentProps) {
  const { server, agentId, tenants, envVariables, transport, onTransportChange } = props;
  const t = useTranslations('mcpMatrix');
  const orderedTenants = useMemo(() => orderTenantsDefaultFirst(tenants), [tenants]);
  const ids = useMemo(() => orderedTenants.map((tenant) => tenant.id), [orderedTenants]);
  const columns = useMemo(() => buildMatrixColumns({ ...server, transport }), [server, transport]);
  const config = useMcpTenantConfigs({ agentId, servers: [server], tenants: ids, envVariables });
  return (
    <>
      <DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>{`${t('title')} — ${server.name}`}</DialogTitle>
          <Button variant="outline" size="xs" onClick={() => void config.verifyAll()}>
            {t('verifyAll')}
          </Button>
        </div>
      </DialogHeader>
      <MatrixBody
        server={server}
        tenants={orderedTenants}
        columns={columns}
        envVariables={envVariables}
        config={config}
        transport={transport}
        onTransportChange={onTransportChange}
      />
    </>
  );
}

export function McpTenantMatrixModal(props: McpTenantMatrixModalProps) {
  const { open, onOpenChange, server, agentId, tenants, envVariables, onTransportChange } = props;
  const [transport, setTransport] = useState<McpTransport>(server.transport);
  const handleTransportChange = (next: McpTransport) => {
    setTransport(next);
    onTransportChange?.(next);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <MatrixContent
          server={server}
          agentId={agentId}
          tenants={tenants}
          envVariables={envVariables}
          transport={transport}
          onTransportChange={handleTransportChange}
        />
      </DialogContent>
    </Dialog>
  );
}
