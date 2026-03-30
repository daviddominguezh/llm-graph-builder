import type { Graph, Operation } from '@daviddh/graph-types';
import { GraphSchema, McpServerConfigSchema } from '@daviddh/graph-types';
import { z } from 'zod';

export interface VersionSummary {
  version: number;
  publishedAt: string;
  publishedBy: string | null;
}

const VersionSummarySchema = z.object({
  version: z.number(),
  publishedAt: z.string(),
  publishedBy: z.string().nullable(),
});

const VersionsResponseSchema = z.object({
  versions: z.array(VersionSummarySchema),
});

const PublishResponseSchema = z.object({
  version: z.number(),
});

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  return JSON.parse(text) as unknown;
}

async function assertOk(res: Response, action: string): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(`${action} failed (${String(res.status)}): ${text}`);
  }
}

function agentPath(agentId: string, suffix: string): string {
  return `/api/agents/${agentId}${suffix}`;
}

const AgentConfigResponseSchema = z.object({
  appType: z.literal('agent'),
  systemPrompt: z.string(),
  maxSteps: z.number().nullable(),
  contextItems: z.array(
    z.object({
      sortOrder: z.number(),
      content: z.string(),
    })
  ),
  mcpServers: z.array(McpServerConfigSchema),
});

type AgentConfigResponse = z.infer<typeof AgentConfigResponseSchema>;

function isAgentConfigResponse(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && 'appType' in raw;
}

export type { AgentConfigResponse };

export async function fetchGraph(agentId: string): Promise<Graph> {
  const res = await fetch(agentPath(agentId, '/graph'));
  await assertOk(res, 'Fetch graph');
  const raw = await parseJsonResponse(res);
  return GraphSchema.parse(raw);
}

export async function fetchGraphOrAgentConfig(
  agentId: string
): Promise<Graph | AgentConfigResponse> {
  const res = await fetch(agentPath(agentId, '/graph'));
  await assertOk(res, 'Fetch graph');
  const raw = await parseJsonResponse(res);
  if (isAgentConfigResponse(raw)) {
    return AgentConfigResponseSchema.parse(raw);
  }
  return GraphSchema.parse(raw);
}

export async function sendOperations(agentId: string, operations: Operation[]): Promise<void> {
  const res = await fetch(agentPath(agentId, '/graph/operations'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations }),
  });
  await assertOk(res, 'Send operations');
}

export async function publishGraph(agentId: string): Promise<{ version: number }> {
  const res = await fetch(agentPath(agentId, '/publish'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  await assertOk(res, 'Publish graph');
  const raw = await parseJsonResponse(res);
  return PublishResponseSchema.parse(raw);
}

export async function fetchVersions(agentId: string): Promise<VersionSummary[]> {
  const res = await fetch(agentPath(agentId, '/versions'));
  await assertOk(res, 'Fetch versions');
  const raw = await parseJsonResponse(res);
  const data = VersionsResponseSchema.parse(raw);
  return data.versions;
}

export async function fetchVersionSnapshot(agentId: string, version: number): Promise<Graph> {
  const res = await fetch(agentPath(agentId, `/versions/${String(version)}`));
  await assertOk(res, 'Fetch version snapshot');
  const raw = await parseJsonResponse(res);
  return GraphSchema.parse(raw);
}

export async function restoreVersion(agentId: string, version: number): Promise<Graph> {
  const res = await fetch(agentPath(agentId, `/versions/${String(version)}/restore`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  await assertOk(res, 'Restore version');
  const raw = await parseJsonResponse(res);
  return GraphSchema.parse(raw);
}
