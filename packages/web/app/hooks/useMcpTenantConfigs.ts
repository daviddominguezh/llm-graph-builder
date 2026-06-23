import type { VariableValue } from '@daviddh/graph-types';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getMcpTenantConfigAction,
  saveMcpTenantCellAction,
  verifyMcpTenantServerAction,
} from '../actions/mcpTenantConfig';
import type {
  McpTenantConfigRow,
  McpTenantDiscoveryRow,
  SaveCellResult,
  ServerAggregateStatus,
  ServerTenantStatus,
} from '../lib/mcpTenantConfig';
import {
  type ServerLike,
  applyCellOptimistic,
  buildHashByCell,
  cellKey,
  computeAggregateStatuses,
  computeTenantStatuses,
  mergeDiscoveryRows,
  mergeSavedRow,
} from '../lib/mcpTenantConfigState';
import type { OrgEnvVariableRow } from '../lib/orgEnvVariables';

export interface UseMcpTenantConfigsArgs {
  agentId: string;
  servers: ServerLike[];
  tenants: string[];
  envVariables: OrgEnvVariableRow[];
}

export interface UseMcpTenantConfigsResult {
  rows: McpTenantConfigRow[];
  discovery: McpTenantDiscoveryRow[];
  loading: boolean;
  saveCell: (serverId: string, tenantId: string, values: Record<string, VariableValue>) => Promise<void>;
  verifyServer: (serverId: string) => Promise<void>;
  verifyAll: () => Promise<void>;
  statusFor: (serverId: string, tenantId: string) => ServerTenantStatus;
  aggregateFor: (serverId: string) => ServerAggregateStatus;
}

export function useMcpTenantConfigs(args: UseMcpTenantConfigsArgs): UseMcpTenantConfigsResult {
  const { agentId, servers, tenants, envVariables } = args;
  const [rows, setRows] = useState<McpTenantConfigRow[]>([]);
  const [discovery, setDiscovery] = useState<McpTenantDiscoveryRow[]>([]);
  const [hashByCell, setHashByCell] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const envNameById = useMemo(() => buildEnvNameById(envVariables), [envVariables]);
  useLoadBundle(agentId, setRows, setDiscovery, setLoading);
  useCellHashes(rows, setHashByCell);

  const statuses = useMemo(
    () => computeTenantStatuses({ servers, tenants, configs: rows, discovery, envNameById, hashByCell }),
    [servers, tenants, rows, discovery, envNameById, hashByCell]
  );
  const aggregate = useMemo(
    () => computeAggregateStatuses(servers, tenants, statuses),
    [servers, tenants, statuses]
  );

  const saveCell = useSaveCell(agentId, rows, setRows);
  const verifyServer = useVerifyServer(agentId, setDiscovery);
  const verifyAll = useVerifyAll(servers, verifyServer);

  const statusFor = useCallback(
    (serverId: string, tenantId: string) => statuses[cellKey(serverId, tenantId)] ?? 'pending',
    [statuses]
  );
  const aggregateFor = useCallback((serverId: string) => aggregate[serverId] ?? 'warning', [aggregate]);

  return { rows, discovery, loading, saveCell, verifyServer, verifyAll, statusFor, aggregateFor };
}

function buildEnvNameById(envVariables: OrgEnvVariableRow[]): Record<string, string> {
  return Object.fromEntries(envVariables.map((v) => [v.id, v.name]));
}

function useLoadBundle(
  agentId: string,
  setRows: (rows: McpTenantConfigRow[]) => void,
  setDiscovery: (rows: McpTenantDiscoveryRow[]) => void,
  setLoading: (loading: boolean) => void
): void {
  useEffect(() => {
    let active = true;
    setLoading(true);
    void getMcpTenantConfigAction(agentId).then(({ result }) => {
      if (!active) return;
      setRows(result?.configs ?? []);
      setDiscovery(result?.discovery ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [agentId, setRows, setDiscovery, setLoading]);
}

function useCellHashes(
  rows: McpTenantConfigRow[],
  setHashByCell: (map: Record<string, string>) => void
): void {
  useEffect(() => {
    let active = true;
    void buildHashByCell(rows).then((map) => {
      if (active) setHashByCell(map);
    });
    return () => {
      active = false;
    };
  }, [rows, setHashByCell]);
}

type SaveCell = (serverId: string, tenantId: string, values: Record<string, VariableValue>) => Promise<void>;

function useSaveCell(
  agentId: string,
  rows: McpTenantConfigRow[],
  setRows: React.Dispatch<React.SetStateAction<McpTenantConfigRow[]>>
): SaveCell {
  return useCallback(
    async (serverId, tenantId, values) => {
      const expectedUpdatedAt = findUpdatedAt(rows, serverId, tenantId);
      setRows((prev) => applyCellOptimistic(prev, { agentId, serverId, tenantId, values }));
      const result = await saveMcpTenantCellAction({
        agentId,
        serverId,
        tenantId,
        variableValues: values,
        expectedUpdatedAt,
      });
      applySaveResult(result, setRows, agentId);
    },
    [agentId, rows, setRows]
  );
}

function findUpdatedAt(rows: McpTenantConfigRow[], serverId: string, tenantId: string): string | null {
  const existing = rows.find((r) => r.server_id === serverId && r.tenant_id === tenantId);
  if (existing === undefined || existing.updated_at === '') return null;
  return existing.updated_at;
}

function applySaveResult(
  result: SaveCellResult,
  setRows: React.Dispatch<React.SetStateAction<McpTenantConfigRow[]>>,
  agentId: string
): void {
  if (result.kind === 'ok') {
    setRows((prev) => mergeSavedRow(prev, result.row));
    return;
  }
  // conflict or error: reload authoritative state from the backend.
  void getMcpTenantConfigAction(agentId).then(({ result: bundle }) => {
    if (bundle !== null) setRows(bundle.configs);
  });
}

function useVerifyServer(
  agentId: string,
  setDiscovery: React.Dispatch<React.SetStateAction<McpTenantDiscoveryRow[]>>
): (serverId: string) => Promise<void> {
  return useCallback(
    async (serverId) => {
      const { result } = await verifyMcpTenantServerAction(agentId, serverId);
      setDiscovery((prev) => mergeDiscoveryRows(prev, serverId, result));
    },
    [agentId, setDiscovery]
  );
}

function useVerifyAll(
  servers: ServerLike[],
  verifyServer: (serverId: string) => Promise<void>
): () => Promise<void> {
  return useCallback(async () => {
    await Promise.all(
      servers.map(async (s) => {
        await verifyServer(s.id);
      })
    );
  }, [servers, verifyServer]);
}
