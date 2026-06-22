// Shared tool-building pipeline for edge functions.
//
// This module is the single source of truth for turning an `ExecutePayload`
// into a registry-backed dict of AI-SDK tools. Both `execute-agent` (LLM loop)
// and `execute-tool` (single-tool runner) call into here so the tool surface
// is identical end-to-end and no provider-specific switching lives outside the
// registry layer.
import type { McpServerConfig } from '@daviddh/graph-types';
import type {
  ApplyResult,
  BuiltinBundles,
  BuiltinProviderId,
  Context,
  FailedAttempt,
  FormData,
  FormDefinition,
  FormsService,
  Logger,
  Message,
  OAuthTokenBundle,
  ProviderCtx,
  Registry,
  SelectedTool,
  SkillDefinition,
} from '@daviddh/llm-graph-runner';
import {
  BUILTIN_PROVIDER_IDS,
  applyFormFields,
  buildAgentToolsAtStart,
  builtInProviders,
  composeRegistry,
  createGoogleCalendarService,
  toAiSdkToolDict,
} from '@daviddh/llm-graph-runner';
import type { Tool } from 'ai';

import {
  makeKvStoreService,
  makeNoStoreBoundKvServices,
  makeNoStoreBoundRagServices,
  makeRagStoreService,
} from './storeServices.ts';

/* ─── Shared types ─── */

export interface VfsPayloadData {
  token: string;
  owner: string;
  repo: string;
  commitSha: string;
  tenantSlug: string;
  agentSlug: string;
  userJwt: string;
  settings: {
    protectedPaths?: string[];
    searchCandidateLimit?: number;
    readLineCeiling?: number;
    rateLimitThreshold?: number;
  };
}

export interface ExecutePayload {
  appType?: 'workflow' | 'agent';
  graph: import('@daviddh/graph-types').RuntimeGraph;
  apiKey: string;
  modelId: string;
  currentNodeId: string;
  messages: Message[];
  structuredOutputs: Record<string, unknown[]>;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
  sessionID: string;
  /** Owning organisation id (distinct from tenantID). Used as MCP cache key. */
  orgID: string;
  tenantID: string;
  userID: string;
  isFirstMessage: boolean;
  vfs?: VfsPayloadData;
  // Agent-specific fields
  systemPrompt?: string;
  context?: string;
  maxSteps?: number | null;
  isChildAgent?: boolean;
  conversationId?: string;
  // Schema version: backend always sends 2.
  schemaVersion?: 2;
  selectedTools?: SelectedTool[];
  skills?: SkillDefinition[];
  oauth?: { byProvider: Record<string, OAuthTokenBundle> };
  selectedKvStoreId?: string | null;
  selectedRagStoreId?: string | null;
}

export type SupabaseClient = Awaited<ReturnType<typeof buildSupabaseClient>>;
type LeadScoringServices = NonNullable<BuiltinBundles['lead_scoring']>['service'];
type FormsBundle = NonNullable<BuiltinBundles['forms']>;
type CalendarBundle = NonNullable<BuiltinBundles['calendar']>;

/* ─── Logger ─── */

function prefixed(fn: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return (...args: unknown[]) => fn('[runner]', ...args);
}

export const runnerLogger: Logger = {
  error: prefixed(console.error),
  warn: prefixed(console.warn),
  help: prefixed(console.info),
  data: prefixed(console.debug),
  info: prefixed(console.info),
  debug: prefixed(console.debug),
  prompt: prefixed(console.debug),
  http: prefixed(console.debug),
  verbose: prefixed(console.debug),
  input: prefixed(console.debug),
  silly: prefixed(console.debug),
};

const log = {
  info: (msg: string) => console.info(`[edge] ${msg}`),
  error: (msg: string) => console.error(`[edge] ${msg}`),
};

/* ─── Supabase client (used by bundle preparers) ─── */

export async function buildSupabaseClient() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(supabaseUrl, serviceKey);
}

/* ─── Calendar bundle ─── */

function buildCalendarBundle(payload: ExecutePayload): CalendarBundle | undefined {
  const calendarToken = payload.oauth?.byProvider?.['calendar'];
  if (calendarToken === undefined) return undefined;
  return {
    service: createGoogleCalendarService({
      getAccessToken: async () => calendarToken.accessToken,
    }),
    calendarId: 'primary',
  };
}

/* ─── Lead scoring services ─── */

async function setLeadScoreOnConversation(
  supabase: SupabaseClient,
  conversationId: string,
  score: number
): Promise<void> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .single();
  const currentMetadata =
    existing !== null && typeof existing.metadata === 'object' && existing.metadata !== null
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const merged = { ...currentMetadata, lead_score: score };
  const { error } = await supabase
    .from('conversations')
    .update({ metadata: merged })
    .eq('id', conversationId);
  if (error !== null) {
    log.error(`set_lead_score failed: ${error.message}`);
  }
}

async function getLeadScoreFromConversation(
  supabase: SupabaseClient,
  conversationId: string
): Promise<number | null> {
  const { data } = await supabase.from('conversations').select('metadata').eq('id', conversationId).single();
  if (data === null || data.metadata === null || typeof data.metadata !== 'object') {
    return null;
  }
  const meta = data.metadata as Record<string, unknown>;
  return typeof meta['lead_score'] === 'number' ? meta['lead_score'] : null;
}

async function buildLeadScoringServices(conversationId: string): Promise<LeadScoringServices> {
  const supabase = await buildSupabaseClient();
  return {
    setLeadScore: (score: number) => setLeadScoreOnConversation(supabase, conversationId, score),
    getLeadScore: () => getLeadScoreFromConversation(supabase, conversationId),
  };
}

/* ─── Forms services ─── */

interface SchemaRow {
  agent_id: string;
  schema_id: string;
  fields: unknown;
}

interface FormRow {
  id: string;
  agent_id: string;
  display_name: string;
  form_slug: string;
  schema_id: string;
  validations: Record<string, unknown>;
}

async function loadAgentIdForConversation(
  supabase: SupabaseClient,
  conversationId: string
): Promise<string | null> {
  const { data } = await supabase.from('conversations').select('agent_id').eq('id', conversationId).single();
  if (data === null) return null;
  return typeof data.agent_id === 'string' ? data.agent_id : null;
}

async function loadFormsForAgent(supabase: SupabaseClient, agentId: string): Promise<FormDefinition[]> {
  const [forms, schemas] = await Promise.all([
    supabase
      .from('graph_forms')
      .select('id, agent_id, display_name, form_slug, schema_id, validations')
      .eq('agent_id', agentId),
    supabase.from('graph_output_schemas').select('agent_id, schema_id, fields').eq('agent_id', agentId),
  ]);
  if (forms.error !== null || schemas.error !== null) return [];
  return mapFormRows(
    (forms.data ?? []) as unknown as FormRow[],
    (schemas.data ?? []) as unknown as SchemaRow[]
  );
}

function mapFormRows(formRows: FormRow[], schemaRows: SchemaRow[]): FormDefinition[] {
  const schemaMap = new Map<string, unknown>();
  for (const s of schemaRows) schemaMap.set(s.schema_id, s.fields);
  return formRows.map((f) => ({
    id: f.id,
    agentId: f.agent_id,
    displayName: f.display_name,
    formSlug: f.form_slug,
    schemaId: f.schema_id,
    schemaFields: (schemaMap.get(f.schema_id) ?? []) as FormDefinition['schemaFields'],
    validations: f.validations as FormDefinition['validations'],
  }));
}

async function readFormDataFromMetadata(
  supabase: SupabaseClient,
  conversationId: string,
  formId: string
): Promise<FormData | undefined> {
  const { data } = await supabase.from('conversations').select('metadata').eq('id', conversationId).single();
  if (data === null || data.metadata === null || typeof data.metadata !== 'object') return undefined;
  const meta = data.metadata as { forms?: Record<string, FormData> };
  return meta.forms?.[formId];
}

function computeFormPatch(current: FormData | undefined, newData: FormData): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(newData)) {
    if (JSON.stringify(current?.[k]) !== JSON.stringify(newData[k])) {
      patch[k] = newData[k];
    }
  }
  return patch;
}

async function applyAtomicViaRpc(
  supabase: SupabaseClient,
  conversationId: string,
  form: FormDefinition,
  fields: Array<{ fieldPath: string; fieldValue: unknown }>
): Promise<ApplyResult> {
  const current = await readFormDataFromMetadata(supabase, conversationId, form.id);
  const result = applyFormFields({ form, currentData: current, fields });
  if (!result.ok) return result;
  const patch = computeFormPatch(current, result.newData);
  const { error } = await supabase.rpc('write_form_data', {
    p_conversation_id: conversationId,
    p_form_id: form.id,
    p_new_fields: patch,
  });
  if (error !== null) log.error(`write_form_data failed: ${error.message}`);
  return result;
}

async function recordFailureViaRpc(
  supabase: SupabaseClient,
  conversationId: string,
  formId: string,
  attempt: FailedAttempt
): Promise<void> {
  const { error } = await supabase.rpc('append_form_failure', {
    p_conversation_id: conversationId,
    p_form_id: formId,
    p_entry: attempt,
  });
  if (error !== null) log.error(`append_form_failure failed: ${error.message}`);
}

function buildPopulatedFormsService(supabase: SupabaseClient, forms: FormDefinition[]): FormsService {
  return {
    getFormDefinitions: () => Promise.resolve(forms),
    getFormData: (convId, formId) => readFormDataFromMetadata(supabase, convId, formId),
    applyFormFieldsAtomic: (args) => applyAtomicViaRpc(supabase, args.conversationId, args.form, args.fields),
    recordFailedAttempt: (convId, formId, attempt) => recordFailureViaRpc(supabase, convId, formId, attempt),
  };
}

function buildEmptyFormsService(supabase: SupabaseClient): FormsService {
  return {
    getFormDefinitions: () => Promise.resolve([]),
    getFormData: (convId, formId) => readFormDataFromMetadata(supabase, convId, formId),
    applyFormFieldsAtomic: () =>
      Promise.resolve({
        ok: false,
        newData: {},
        results: [{ fieldPath: '', status: 'pathError' as const, reason: 'No forms configured' }],
      }),
    recordFailedAttempt: (convId, formId, attempt) => recordFailureViaRpc(supabase, convId, formId, attempt),
  };
}

async function buildFormsBundle(conversationId: string): Promise<FormsBundle | undefined> {
  const supabase = await buildSupabaseClient();
  const agentId = await loadAgentIdForConversation(supabase, conversationId);
  if (agentId === null) return undefined;
  const forms = await loadFormsForAgent(supabase, agentId);
  if (forms.length === 0) return { service: buildEmptyFormsService(supabase), forms: [] };
  return { service: buildPopulatedFormsService(supabase, forms), forms };
}

/* ─── Per-provider preparers ─── */

type BundlePreparer<K extends BuiltinProviderId> = (
  payload: ExecutePayload,
  supabase: SupabaseClient
) => Promise<BuiltinBundles[K]>;

function prepareKvBundle(
  payload: ExecutePayload,
  supabase: SupabaseClient
): Promise<BuiltinBundles['kv_store']> {
  const storeId = payload.selectedKvStoreId;
  const services =
    storeId === undefined || storeId === null || storeId === ''
      ? makeNoStoreBoundKvServices()
      : makeKvStoreService(supabase, storeId);
  return Promise.resolve(services);
}

function prepareRagBundle(
  payload: ExecutePayload,
  supabase: SupabaseClient
): Promise<BuiltinBundles['rag']> {
  const storeId = payload.selectedRagStoreId;
  const services =
    storeId === undefined || storeId === null || storeId === ''
      ? makeNoStoreBoundRagServices()
      : makeRagStoreService(supabase, storeId);
  return Promise.resolve(services);
}

async function prepareFormsBundle(payload: ExecutePayload): Promise<BuiltinBundles['forms']> {
  if (payload.conversationId === undefined) return undefined;
  return await buildFormsBundle(payload.conversationId);
}

async function prepareLeadScoringBundle(
  payload: ExecutePayload
): Promise<BuiltinBundles['lead_scoring']> {
  if (payload.conversationId === undefined) return undefined;
  const service = await buildLeadScoringServices(payload.conversationId);
  return { service };
}

function prepareCalendarBundle(payload: ExecutePayload): Promise<BuiltinBundles['calendar']> {
  return Promise.resolve(buildCalendarBundle(payload));
}

function prepareCompositionBundle(): Promise<BuiltinBundles['composition']> {
  return Promise.resolve(undefined);
}

const PREPARERS: { [K in BuiltinProviderId]: BundlePreparer<K> } = {
  kv_store: (payload, supabase) => prepareKvBundle(payload, supabase),
  rag: (payload, supabase) => prepareRagBundle(payload, supabase),
  forms: (payload) => prepareFormsBundle(payload),
  lead_scoring: (payload) => prepareLeadScoringBundle(payload),
  calendar: (payload) => prepareCalendarBundle(payload),
  composition: () => prepareCompositionBundle(),
};

export async function prepareAllBundles(
  payload: ExecutePayload,
  supabase: SupabaseClient
): Promise<BuiltinBundles> {
  const entries = await Promise.all(
    BUILTIN_PROVIDER_IDS.map(async (id) => {
      const preparer = PREPARERS[id] as BundlePreparer<BuiltinProviderId>;
      const bundle = await preparer(payload, supabase);
      return [id, bundle] as const;
    })
  );
  return Object.fromEntries(entries) as BuiltinBundles;
}

/* ─── Provider context + tools ─── */

function buildServicesResolver(bundles: BuiltinBundles): (providerId: string) => unknown {
  return (providerId: string): unknown => {
    if (providerId in bundles) return bundles[providerId as BuiltinProviderId];
    return undefined;
  };
}

interface BuildProviderCtxArgs {
  payload: ExecutePayload;
  conversationId?: string;
  bundles: BuiltinBundles;
}

export function buildProviderCtx(args: BuildProviderCtxArgs): ProviderCtx {
  const { payload, conversationId, bundles } = args;
  const oauthEntries: Array<[string, OAuthTokenBundle]> = Object.entries(payload.oauth?.byProvider ?? {});
  const mcpServerEntries: Array<[string, McpServerConfig]> = (payload.graph.mcpServers ?? []).map((s) => [
    s.id,
    s,
  ]);
  return {
    orgId: payload.orgID,
    tenantId: payload.tenantID,
    agentId: payload.sessionID,
    isChildAgent: payload.isChildAgent ?? false,
    logger: runnerLogger,
    conversationId,
    contextData: payload.data,
    oauthTokens: new Map<string, OAuthTokenBundle>(oauthEntries),
    mcpServers: new Map<string, McpServerConfig>(mcpServerEntries),
    services: buildServicesResolver(bundles),
  };
}

export function buildRegistry(payload: ExecutePayload): Registry {
  return composeRegistry({
    builtIns: builtInProviders,
    orgMcpServers: payload.graph.mcpServers ?? [],
    logger: runnerLogger,
  });
}

export interface BuildToolsV2Args {
  payload: ExecutePayload;
  conversationId: string | undefined;
  bundles: BuiltinBundles;
}

export async function buildToolsForAgentV2(input: BuildToolsV2Args): Promise<Record<string, Tool>> {
  const registry = buildRegistry(input.payload);
  const ctx = buildProviderCtx({
    payload: input.payload,
    conversationId: input.conversationId,
    bundles: input.bundles,
  });
  const built = await buildAgentToolsAtStart(registry, ctx, input.payload.selectedTools ?? []);
  return toAiSdkToolDict(built.tools);
}

/* ─── Context (workflow path) ─── */

export function buildBaseContext(
  payload: ExecutePayload
): Omit<Context, 'toolsOverride' | 'onNodeVisited' | 'onNodeProcessed'> {
  return {
    graph: payload.graph,
    apiKey: payload.apiKey,
    modelId: payload.modelId,
    sessionID: payload.sessionID,
    tenantID: payload.tenantID,
    userID: payload.userID,
    data: payload.data,
    quickReplies: payload.quickReplies,
    isFirstMessage: payload.isFirstMessage,
  };
}
