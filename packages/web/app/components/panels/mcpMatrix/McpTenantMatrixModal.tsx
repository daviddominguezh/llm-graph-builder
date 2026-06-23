'use client';

import type { McpServerStatus } from '@/app/hooks/useMcpServers';
import { useMcpTenantConfigs } from '@/app/hooks/useMcpTenantConfigs';
import type { McpAuthType } from '@/app/lib/mcpLibraryTypes';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import type { McpServerConfig } from '@/app/schemas/graph.schema';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Scrollable } from '../../Scrollable';
import { ServerDefinitionFields } from '../ServerDefinitionFields';
import { MatrixSection } from './MatrixSection';
import { MatrixToolbar } from './MatrixToolbar';
import {
  type MatrixTenant,
  buildMatrixColumns,
  mergeCellValue,
  orderTenantsDefaultFirst,
  valuesForTenant,
} from './mcpMatrixModalLogic';

type VariableInput = Parameters<typeof mergeCellValue>[2];

export interface McpTenantMatrixModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: McpServerConfig;
  status: McpServerStatus;
  isDiscovering: boolean;
  agentId: string;
  tenants: MatrixTenant[];
  envVariables: OrgEnvVariableRow[];
  orgId: string;
  authType?: McpAuthType;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
  onDiscover: () => void;
  onPublish: () => void;
}

interface MatrixConfigArgs {
  server: McpServerConfig;
  agentId: string;
  tenants: MatrixTenant[];
  envVariables: OrgEnvVariableRow[];
}

function useMatrixConfig({ server, agentId, tenants, envVariables }: MatrixConfigArgs) {
  const orderedTenants = useMemo(() => orderTenantsDefaultFirst(tenants), [tenants]);
  const ids = useMemo(() => orderedTenants.map((tenant) => tenant.id), [orderedTenants]);
  const columns = useMemo(() => buildMatrixColumns(server), [server]);
  const config = useMcpTenantConfigs({ agentId, servers: [server], tenants: ids, envVariables });
  return { orderedTenants, columns, config };
}

function DefinitionSection(props: McpTenantMatrixModalProps) {
  const t = useTranslations('mcpMatrix');
  const isFromLibrary = props.server.libraryItemId !== undefined;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold">{t('definitionTitle')}</h3>
        {isFromLibrary && <span className="text-[0.625rem] text-muted-foreground">{t('libraryConfig')}</span>}
      </div>
      <ServerDefinitionFields
        server={props.server}
        status={props.status}
        isDiscovering={props.isDiscovering}
        envVariables={props.envVariables}
        orgId={props.orgId}
        authType={props.authType}
        onUpdate={props.onUpdate}
        onDiscover={props.onDiscover}
        onPublish={props.onPublish}
      />
    </section>
  );
}

function MatrixContent(props: McpTenantMatrixModalProps) {
  const { server, agentId, tenants, envVariables } = props;
  const { orderedTenants, columns, config } = useMatrixConfig({ server, agentId, tenants, envVariables });

  const onCellChange = (tenantId: string, variable: string, value: VariableInput) => {
    const values = valuesForTenant(config.rows, server.id, tenantId);
    void config.saveCell(server.id, tenantId, mergeCellValue(values, variable, value));
  };

  return (
    <>
      <MatrixToolbar onVerifyAll={() => void config.verifyAll()} />
      <Scrollable className="-mx-1 flex-1 px-1">
        <div className="flex flex-col gap-4">
          <DefinitionSection {...props} />
          <MatrixSection
            server={server}
            tenants={orderedTenants}
            columns={columns}
            envVariables={envVariables}
            config={config}
            statusFor={(tenantId) => config.statusFor(server.id, tenantId)}
            valuesFor={(tenantId) => valuesForTenant(config.rows, server.id, tenantId)}
            onTest={() => void config.verifyServer(server.id)}
            onCellChange={onCellChange}
          />
        </div>
      </Scrollable>
    </>
  );
}

export function McpTenantMatrixModal(props: McpTenantMatrixModalProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{props.server.name}</DialogTitle>
        </DialogHeader>
        <MatrixContent {...props} />
      </DialogContent>
    </Dialog>
  );
}
