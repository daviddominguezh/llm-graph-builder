import type { McpServerConfig } from '@daviddh/graph-types';

import type { StreamCallbacks } from './api';
import { readSseStream } from './api';

export interface AgentSimulateRequestBody {
  appType: 'agent';
  systemPrompt: string;
  maxSteps: number | null;
  contextItems: Array<{ sortOrder: number; content: string }>;
  mcpServers: McpServerConfig[];
  messages: unknown[];
  apiKeyId: string;
  modelId: string;
}

export async function streamAgentSimulation(
  params: AgentSimulateRequestBody,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok) {
    throw new Error(`Agent simulation request failed: ${String(res.status)}`);
  }

  const reader = res.body?.getReader();
  if (reader === undefined) {
    throw new Error('No response stream available');
  }

  await readSseStream(reader, callbacks);
}
