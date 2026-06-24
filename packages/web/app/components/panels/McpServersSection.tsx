'use client';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { BookOpen, Plus } from 'lucide-react';
import { useMemo } from 'react';

import type { McpServerStatus } from '../../hooks/useMcpServers';
import { useMcpTenantConfigs } from '../../hooks/useMcpTenantConfigs';
import type { McpAuthType, McpLibraryRow } from '../../lib/mcpLibraryTypes';
import type { OrgEnvVariableRow } from '../../lib/orgEnvVariables';
import type { McpServerConfig } from '../../schemas/graph.schema';
import { useToolRegistry } from '../ToolRegistryProvider';
import { McpServerRow } from './McpServerRow';
import type { SectionTenant } from './mcpServersSectionLogic';

interface McpServersSectionProps {
  servers: McpServerConfig[];
  discovering: Record<string, boolean>;
  serverStatus: Record<string, McpServerStatus>;
  agentId: string;
  tenants: SectionTenant[];
  orgId: string;
  envVariables: OrgEnvVariableRow[];
  libraryItems?: McpLibraryRow[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<McpServerConfig>) => void;
  onDiscover: (id: string) => void;
  onPublish: (server: McpServerConfig) => void;
  onOpenLibrary: () => void;
}

function getAuthType(server: McpServerConfig, libraryItems: McpLibraryRow[]): McpAuthType | undefined {
  if (server.libraryItemId === undefined) return undefined;
  return libraryItems.find((i) => i.id === server.libraryItemId)?.auth_type;
}

function buildNoVersionMap(groups: ReturnType<typeof useToolRegistry>['groups']): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const g of groups) {
    if (g.kind !== 'mcp') continue;
    out[g.providerId] = g.serverVersion === '';
  }
  return out;
}

function SectionHeader({ onOpenLibrary, onAdd }: { onOpenLibrary: () => void; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <Label>MCP Servers</Label>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-xs" className="rounded-full" onClick={onOpenLibrary}>
          <BookOpen className="size-3" />
        </Button>
        <Button variant="ghost" size="icon-xs" className="rounded-full" onClick={onAdd}>
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}

export function McpServersSection(props: McpServersSectionProps) {
  const { servers, discovering, serverStatus, agentId, tenants, envVariables, orgId } = props;
  const items = props.libraryItems ?? [];
  const { groups } = useToolRegistry();
  const noVersionMap = buildNoVersionMap(groups);
  const tenantIds = useMemo(() => tenants.map((tenant) => tenant.id), [tenants]);
  const { aggregateFor, loading: aggregateLoading } = useMcpTenantConfigs({
    agentId,
    servers,
    tenants: tenantIds,
    envVariables,
  });
  const sorted = useMemo(() => [...servers].sort((a, b) => a.name.localeCompare(b.name)), [servers]);

  return (
    <div className="mt-2">
      <SectionHeader onOpenLibrary={props.onOpenLibrary} onAdd={props.onAdd} />
      <ul className="space-y-2 pl-2">
        {sorted.map((server) => (
          <McpServerRow
            key={server.id}
            server={server}
            status={serverStatus[server.id] ?? 'pending'}
            aggregate={aggregateFor(server.id)}
            aggregateLoading={aggregateLoading}
            isDiscovering={discovering[server.id] ?? false}
            noVersion={noVersionMap[server.id] ?? false}
            agentId={agentId}
            tenants={tenants}
            envVariables={envVariables}
            orgId={orgId}
            authType={getAuthType(server, items)}
            onRemove={() => props.onRemove(server.id)}
            onUpdate={(updates) => props.onUpdate(server.id, updates)}
            onDiscover={() => props.onDiscover(server.id)}
            onPublish={() => props.onPublish(server)}
          />
        ))}
      </ul>
    </div>
  );
}
