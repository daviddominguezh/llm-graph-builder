'use client';

import { useCallback } from 'react';

import type { McpServerConfig } from '../schemas/graph.schema';
import type { AgentConfigData } from './useGraphLoader';

const JSON_INDENT = 2;

interface UseAgentExportParams {
  agentConfig: AgentConfigData | undefined;
  mcpServers: McpServerConfig[];
}

function buildExportData(agentConfig: AgentConfigData, mcpServers: McpServerConfig[]) {
  return {
    appType: 'agent' as const,
    systemPrompt: agentConfig.systemPrompt,
    maxSteps: agentConfig.maxSteps,
    contextItems: agentConfig.contextItems.map((item) => item.content),
    mcpServers,
  };
}

function downloadJson(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, JSON_INDENT);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function useAgentExport({ agentConfig, mcpServers }: UseAgentExportParams): () => void {
  return useCallback(() => {
    if (agentConfig === undefined) return;
    const exportData = buildExportData(agentConfig, mcpServers);
    downloadJson(exportData, 'agent-config.json');
  }, [agentConfig, mcpServers]);
}
