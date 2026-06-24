'use client';

import { useMcpTenantConfigs } from '@/app/hooks/useMcpTenantConfigs';
import type { McpAuthType } from '@/app/lib/mcpLibraryTypes';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import type { McpServerConfig } from '@/app/schemas/graph.schema';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

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

const SINGLE_VARIABLE = 1;
const TWO_VARIABLES = 2;
const DEFINITION_PANEL_ID = 'mcp-server-definition-panel';

export interface McpTenantMatrixModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server: McpServerConfig;
  agentId: string;
  tenants: MatrixTenant[];
  envVariables: OrgEnvVariableRow[];
  orgId: string;
  authType?: McpAuthType;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
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

function widthClassForColumns(columnCount: number): string {
  if (columnCount <= SINGLE_VARIABLE) return 'w-[680px]';
  if (columnCount === TWO_VARIABLES) return 'w-[920px]';
  return 'w-[calc(100vw-4rem)]';
}

interface DefinitionHeaderProps {
  open: boolean;
  onToggle: () => void;
}

function DefinitionHeader({ open, onToggle }: DefinitionHeaderProps) {
  const t = useTranslations('mcpMatrix');
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={DEFINITION_PANEL_ID}
      onClick={onToggle}
      className="group -mx-1 flex w-fit cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <ChevronRight
        className={`size-3 text-muted-foreground transition-transform duration-200 group-hover:text-foreground motion-reduce:transition-none ${
          open ? 'rotate-90' : ''
        }`}
      />
      <h3 className="text-xs font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
        {t('definitionTitle')}
      </h3>
    </button>
  );
}

function DefinitionSection(props: McpTenantMatrixModalProps) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col">
      <DefinitionHeader open={open} onToggle={() => setOpen((v) => !v)} />
      <div
        id={DEFINITION_PANEL_ID}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2 pt-2">
            <ServerDefinitionFields
              server={props.server}
              envVariables={props.envVariables}
              orgId={props.orgId}
              authType={props.authType}
              onUpdate={props.onUpdate}
              onPublish={props.onPublish}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function MatrixContent(props: McpTenantMatrixModalProps) {
  const t = useTranslations('mcpMatrix');
  const { server, agentId, tenants, envVariables } = props;
  const { orderedTenants, columns, config } = useMatrixConfig({ server, agentId, tenants, envVariables });

  const onCellChange = (tenantId: string, variable: string, value: VariableInput) => {
    const values = valuesForTenant(config.rows, server.id, tenantId);
    void config.saveCell(server.id, tenantId, mergeCellValue(values, variable, value));
  };

  return (
    <>
      <MatrixToolbar saving={config.saving} onVerifyAll={() => void config.verifyAll()} />
      <Separator />
      <Scrollable className="-mx-1 min-h-0 flex-1 px-1">
        <div className="cursor-default flex flex-col gap-4 pt-1.5">
          <DefinitionSection {...props} />
          <p className="text-xs text-muted-foreground">{t('matrixHelp')}</p>
          <MatrixSection
            server={server}
            tenants={orderedTenants}
            columns={columns}
            envVariables={envVariables}
            config={config}
            statusFor={(tenantId) => config.statusFor(server.id, tenantId)}
            valuesFor={(tenantId) => valuesForTenant(config.rows, server.id, tenantId)}
            onTest={(tenantId) => void config.verifyTenant(server.id, tenantId)}
            onCellChange={onCellChange}
          />
        </div>
      </Scrollable>
    </>
  );
}

export function McpTenantMatrixModal(props: McpTenantMatrixModalProps) {
  const columns = useMemo(() => buildMatrixColumns(props.server), [props.server]);
  const widthClass = widthClassForColumns(columns.length);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className={`flex max-h-[calc(100vh-4rem)] max-w-none flex-col gap-3 sm:max-w-none ${widthClass}`}
      >
        <DialogHeader className='border-b pb-1'>
          <DialogTitle className="cursor-default">{props.server.name}</DialogTitle>
        </DialogHeader>
        <MatrixContent {...props} />
      </DialogContent>
    </Dialog>
  );
}
