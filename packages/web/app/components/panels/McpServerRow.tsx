'use client';

import type { ServerAggregateStatus } from '@/app/lib/mcpTenantConfig';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, ChevronDown, Trash2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { McpServerStatus } from '../../hooks/useMcpServers';
import type { McpAuthType, McpLibraryRow } from '../../lib/mcpLibraryTypes';
import type { OrgEnvVariableRow } from '../../lib/orgEnvVariables';
import type { McpServerConfig, McpTransport } from '../../schemas/graph.schema';
import { NoServerVersionBadge } from './NoServerVersionBadge';
import { ServerDefinitionFields } from './ServerDefinitionFields';
import { McpTenantMatrixModal } from './mcpMatrix/McpTenantMatrixModal';
import {
  type AggregateIconKind,
  type SectionTenant,
  describeAggregateStatus,
  toMatrixTenants,
} from './mcpServersSectionLogic';

function AggregateStatusIcon({ status }: { status: ServerAggregateStatus }) {
  const { iconKind, colorClassName } = describeAggregateStatus(status);
  return <StatusGlyph kind={iconKind} className={`size-3 ${colorClassName}`} />;
}

function StatusGlyph({ kind, className }: { kind: AggregateIconKind; className: string }) {
  if (kind === 'ok') return <CheckCircle className={className} />;
  if (kind === 'error') return <XCircle className={className} />;
  return <AlertTriangle className={className} />;
}

export interface McpServerRowProps {
  server: McpServerConfig;
  status: McpServerStatus;
  aggregate: ServerAggregateStatus;
  isDiscovering: boolean;
  noVersion: boolean;
  agentId: string;
  tenants: SectionTenant[];
  envVariables: OrgEnvVariableRow[];
  orgId: string;
  authType?: McpAuthType;
  onRemove: () => void;
  onUpdate: (updates: Partial<McpServerConfig>) => void;
  onDiscover: () => void;
  onPublish: () => void;
}

function RowHeader({
  server,
  aggregate,
  noVersion,
  onEdit,
  onToggle,
  onRemove,
  expanded,
}: {
  server: McpServerConfig;
  aggregate: ServerAggregateStatus;
  noVersion: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
  expanded: boolean;
}) {
  const t = useTranslations('toolbar');
  return (
    <div className="flex items-center justify-between">
      <button type="button" className="flex items-center gap-1.5 text-xs" onClick={onToggle}>
        <ChevronDown className={`size-3 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        <AggregateStatusIcon status={aggregate} />
        {server.name}
        {noVersion && <NoServerVersionBadge />}
      </button>
      <div className="flex items-center gap-1">
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onEdit}>
          {t('edit')}
        </Button>
        <Button
          variant="destructive"
          size="icon-sm"
          title="Remove server"
          className="rounded-full"
          onClick={onRemove}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

export function McpServerRow(props: McpServerRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const handleTransportChange = (transport: McpTransport) => props.onUpdate({ transport });

  return (
    <li className="rounded-md px-3 py-2 bg-background border-[0.5px] dark:border-0">
      <RowHeader
        server={props.server}
        aggregate={props.aggregate}
        noVersion={props.noVersion}
        expanded={expanded}
        onEdit={() => setMatrixOpen(true)}
        onToggle={() => setExpanded((prev) => !prev)}
        onRemove={props.onRemove}
      />
      {expanded && (
        <div className="space-y-2 mt-2">
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
        </div>
      )}
      <McpTenantMatrixModal
        open={matrixOpen}
        onOpenChange={setMatrixOpen}
        server={props.server}
        agentId={props.agentId}
        tenants={toMatrixTenants(props.tenants)}
        envVariables={props.envVariables}
        onTransportChange={handleTransportChange}
      />
    </li>
  );
}

export type { McpLibraryRow };
