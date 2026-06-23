'use client';

import type { ServerAggregateStatus } from '@/app/lib/mcpTenantConfig';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, SlidersHorizontal, Trash2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { McpServerStatus } from '../../hooks/useMcpServers';
import type { McpAuthType, McpLibraryRow } from '../../lib/mcpLibraryTypes';
import type { OrgEnvVariableRow } from '../../lib/orgEnvVariables';
import type { McpServerConfig } from '../../schemas/graph.schema';
import { NoServerVersionBadge } from './NoServerVersionBadge';
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

interface TileProps {
  server: McpServerConfig;
  aggregate: ServerAggregateStatus;
  noVersion: boolean;
  onConfigure: () => void;
  onRemove: () => void;
}

function ServerTile({ server, aggregate, noVersion, onConfigure, onRemove }: TileProps) {
  const t = useTranslations('toolbar');
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5 text-xs">
        <AggregateStatusIcon status={aggregate} />
        <span className="truncate">{server.name}</span>
        {noVersion && <NoServerVersionBadge />}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          title={t('configure')}
          aria-label={t('configure')}
          onClick={onConfigure}
        >
          <SlidersHorizontal className="size-3" />
        </Button>
        <Button
          variant="destructive"
          size="icon-sm"
          title={t('removeServer')}
          aria-label={t('removeServer')}
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
  const [matrixOpen, setMatrixOpen] = useState(false);

  return (
    <li className="rounded-md border-[0.5px] bg-background px-3 py-2 dark:border-0">
      <ServerTile
        server={props.server}
        aggregate={props.aggregate}
        noVersion={props.noVersion}
        onConfigure={() => setMatrixOpen(true)}
        onRemove={props.onRemove}
      />
      <McpTenantMatrixModal
        open={matrixOpen}
        onOpenChange={setMatrixOpen}
        server={props.server}
        status={props.status}
        isDiscovering={props.isDiscovering}
        agentId={props.agentId}
        tenants={toMatrixTenants(props.tenants)}
        envVariables={props.envVariables}
        orgId={props.orgId}
        authType={props.authType}
        onUpdate={props.onUpdate}
        onDiscover={props.onDiscover}
        onPublish={props.onPublish}
      />
    </li>
  );
}

export type { McpLibraryRow };
