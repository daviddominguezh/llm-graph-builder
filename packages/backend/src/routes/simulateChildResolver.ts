import type { McpServerConfig } from '@daviddh/graph-types';

import type { SupabaseClient } from '../db/queries/operationHelpers.js';

/* ─── Public types ─── */

export interface ResolvedChildConfig {
  systemPrompt: string;
  context: string;
  modelId: string;
  maxSteps: number | null;
  mcpServers: McpServerConfig[];
  isChildAgent: boolean;
  task: string;
}

type DispatchType = 'create_agent' | 'invoke_agent' | 'invoke_workflow';

export interface ResolveChildParams {
  supabase: SupabaseClient;
  dispatchType: DispatchType;
  params: Record<string, unknown>;
  orgId: string;
}

/* ─── Graph data shape from agent_versions ─── */

interface ContextItem {
  sortOrder?: number;
  content: string;
}

interface PublishedAgentGraphData {
  systemPrompt?: string;
  maxSteps?: number | null;
  contextItems?: ContextItem[];
  mcpServers?: McpServerConfig[];
}

/* ─── Constants ─── */

const EMPTY_LENGTH = 0;
const DEFAULT_VERSION = 1;
const LATEST_VERSION_LIMIT = 1;

/* ─── Param extraction helpers ─── */

function stringParam(params: Record<string, unknown>, key: string, fallback: string): string {
  const { [key]: val } = params;
  return typeof val === 'string' ? val : fallback;
}

function numberOrNull(params: Record<string, unknown>, key: string): number | null {
  const { [key]: val } = params;
  return typeof val === 'number' ? val : null;
}

/* ─── Context flattening ─── */

function flattenContextItems(items: ContextItem[] | undefined): string {
  if (items === undefined || items.length === EMPTY_LENGTH) return '';
  return items.map((item) => item.content).join('\n\n');
}

function isContextItemArray(val: unknown): val is ContextItem[] {
  if (!Array.isArray(val)) return false;
  return val.every((item) => typeof item === 'object' && item !== null && 'content' in item);
}

function extractContextItems(params: Record<string, unknown>): ContextItem[] | undefined {
  const { contextItems } = params;
  return isContextItemArray(contextItems) ? contextItems : undefined;
}

/* ─── Agent ID lookup by slug ─── */

interface AgentIdRow {
  id: string;
}

async function lookupAgentId(supabase: SupabaseClient, slug: string, orgId: string): Promise<string> {
  const result = await supabase.from('agents').select('id').eq('slug', slug).eq('org_id', orgId).single();

  const row: AgentIdRow | null = result.data as AgentIdRow | null;
  if (row === null) {
    throw new Error(`Agent not found: slug="${slug}" in org="${orgId}"`);
  }
  return row.id;
}

/* ─── Resolve version number, supporting 'latest' ─── */

interface VersionRow {
  version: number;
}

async function resolveVersion(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  agentId: string
): Promise<number> {
  const { version: raw } = params;
  if (raw === 'latest') {
    const result = await supabase
      .from('agent_versions')
      .select('version')
      .eq('agent_id', agentId)
      .order('version', { ascending: false })
      .limit(LATEST_VERSION_LIMIT)
      .maybeSingle();
    const row = result.data as VersionRow | null;
    if (row === null) throw new Error(`No published versions for agent "${agentId}"`);
    return row.version;
  }
  return numberOrNull(params, 'version') ?? DEFAULT_VERSION;
}

/* ─── Published version graph_data fetch ─── */

interface GraphDataRow {
  graph_data: Record<string, unknown>;
}

async function fetchVersionGraphData(
  supabase: SupabaseClient,
  agentId: string,
  version: number
): Promise<Record<string, unknown>> {
  const result = await supabase
    .from('agent_versions')
    .select('graph_data')
    .eq('agent_id', agentId)
    .eq('version', version)
    .single();

  const row: GraphDataRow | null = result.data as GraphDataRow | null;
  if (row === null) {
    throw new Error(`Version ${String(version)} not found for agent "${agentId}"`);
  }
  return row.graph_data;
}

/* ─── Type guard for graph data ─── */

function isAgentGraphData(val: unknown): val is PublishedAgentGraphData {
  return typeof val === 'object' && val !== null;
}

/* ─── Merge extra context items from params ─── */

function mergeContext(baseContext: string, params: Record<string, unknown>): string {
  const extra = extractContextItems(params);
  if (extra === undefined) return baseContext;
  const extraText = flattenContextItems(extra);
  if (baseContext === '') return extraText;
  if (extraText === '') return baseContext;
  return `${baseContext}\n\n${extraText}`;
}

/* ─── Build config from published graph data ─── */

function buildConfigFromGraphData(
  graphData: Record<string, unknown>,
  params: Record<string, unknown>
): ResolvedChildConfig {
  const gd: PublishedAgentGraphData = isAgentGraphData(graphData) ? graphData : {};
  const baseContext = flattenContextItems(gd.contextItems);
  const modelOverride = stringParam(params, 'model', '');
  const mcpServers: McpServerConfig[] = Array.isArray(gd.mcpServers) ? gd.mcpServers : [];

  return {
    systemPrompt: gd.systemPrompt ?? '',
    context: mergeContext(baseContext, params),
    modelId: modelOverride,
    maxSteps: gd.maxSteps ?? null,
    mcpServers,
    isChildAgent: true,
    task: stringParam(params, 'task', ''),
  };
}

/* ─── resolve invoke_agent ─── */

async function resolveInvokeAgent(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  orgId: string
): Promise<ResolvedChildConfig> {
  const slug = stringParam(params, 'agentSlug', '');
  if (slug === '') throw new Error('invoke_agent requires "agentSlug" param');

  const agentId = await lookupAgentId(supabase, slug, orgId);
  const version = await resolveVersion(supabase, params, agentId);
  const graphData = await fetchVersionGraphData(supabase, agentId, version);

  return buildConfigFromGraphData(graphData, params);
}

/* ─── resolve create_agent ─── */

function resolveCreateAgent(params: Record<string, unknown>): ResolvedChildConfig {
  return {
    systemPrompt: stringParam(params, 'systemPrompt', ''),
    context: flattenContextItems(extractContextItems(params)),
    modelId: stringParam(params, 'model', ''),
    maxSteps: numberOrNull(params, 'maxSteps'),
    mcpServers: [],
    isChildAgent: true,
    task: stringParam(params, 'task', ''),
  };
}

/* ─── resolve invoke_workflow ─── */

async function resolveInvokeWorkflow(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  orgId: string
): Promise<ResolvedChildConfig> {
  const slug = stringParam(params, 'workflowSlug', '');
  if (slug === '') throw new Error('invoke_workflow requires "workflowSlug" param');

  const agentId = await lookupAgentId(supabase, slug, orgId);
  const version = await resolveVersion(supabase, params, agentId);
  const graphData = await fetchVersionGraphData(supabase, agentId, version);
  const gd: PublishedAgentGraphData = isAgentGraphData(graphData) ? graphData : {};
  const baseContext = flattenContextItems(gd.contextItems);

  return {
    systemPrompt: gd.systemPrompt ?? '',
    context: mergeContext(baseContext, params),
    modelId: stringParam(params, 'model', ''),
    maxSteps: gd.maxSteps ?? null,
    mcpServers: Array.isArray(gd.mcpServers) ? gd.mcpServers : [],
    isChildAgent: false,
    task: stringParam(params, 'user_said', ''),
  };
}

/* ─── Dispatch map ─── */

const DISPATCH_HANDLERS: Record<
  DispatchType,
  (
    supabase: SupabaseClient,
    params: Record<string, unknown>,
    orgId: string
  ) => Promise<ResolvedChildConfig> | ResolvedChildConfig
> = {
  invoke_agent: resolveInvokeAgent,
  create_agent: (_supabase, params) => resolveCreateAgent(params),
  invoke_workflow: resolveInvokeWorkflow,
};

/* ─── Public entry point ─── */

export async function resolveChildConfig(input: ResolveChildParams): Promise<ResolvedChildConfig> {
  const { supabase, dispatchType, params, orgId } = input;
  const { [dispatchType]: handler } = DISPATCH_HANDLERS;
  return await handler(supabase, params, orgId);
}
