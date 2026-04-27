// Supabase Edge Function — Stateless Agent Executor
// Receives complete payload, executes agent via @daviddh/llm-graph-runner, streams SSE events back.
// No DB access, no secrets resolution — all provided in the payload.
import { createMCPClient } from '@ai-sdk/mcp';
import type { McpServerConfig, McpTransport, RuntimeGraph } from '@daviddh/graph-types';
import type {
  AgentLoopResult,
  AgentStepEvent,
  ApplyResult,
  CalendarService,
  CallAgentOutput,
  Context,
  FailedAttempt,
  FormData,
  FormDefinition,
  FormsService,
  Logger,
  Message,
  NodeProcessedEvent,
  OAuthTokenBundle,
  ProviderCtx,
  Registry,
  SelectedTool,
} from '@daviddh/llm-graph-runner';
import {
  VFSContext,
  applyFormFields,
  buildAgentToolsAtStart,
  builtInProviders,
  composeRegistry,
  createGoogleCalendarService,
  executeAgentLoop,
  executeWithCallbacks,
  generateVFSTools,
  injectSystemTools,
  toAiSdkToolDict,
} from '@daviddh/llm-graph-runner';
import { GitHubSourceProvider } from '@daviddh/vfs-providers';
import type { Tool } from 'ai';

interface VfsPayloadData {
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

interface GoogleCalendarPayload {
  accessToken: string;
  orgId: string;
}

interface CalendarBundle {
  services: CalendarService;
  orgId: string;
}

interface ExecutePayload {
  appType?: 'workflow' | 'agent';
  graph: RuntimeGraph;
  apiKey: string;
  modelId: string;
  currentNodeId: string;
  messages: Message[];
  structuredOutputs: Record<string, unknown[]>;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
  sessionID: string;
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
  // Pre-resolved OAuth bundles (backend resolves; edge function is stateless)
  googleCalendar?: GoogleCalendarPayload;
  // v2 schema fields (Plan B+C+D Tasks 15+19). Optional during transition;
  // when `schemaVersion === 2`, tools come from the Provider registry.
  schemaVersion?: 1 | 2;
  selectedTools?: SelectedTool[];
  oauth?: { byProvider: Record<string, OAuthTokenBundle> };
}

function buildCalendarBundle(payload: ExecutePayload): CalendarBundle | undefined {
  const { googleCalendar } = payload;
  if (googleCalendar === undefined) return undefined;
  return {
    services: createGoogleCalendarService({
      getAccessToken: async () => googleCalendar.accessToken,
    }),
    orgId: googleCalendar.orgId,
  };
}

/**
 * v2 calendar bundle: reads the calendar OAuth token from `payload.oauth.byProvider.calendar`
 * (resolved by the backend). v1 path still uses `buildCalendarBundle` above.
 */
function buildCalendarBundleV2(payload: ExecutePayload): CalendarBundle | undefined {
  const calendarToken = payload.oauth?.byProvider?.['calendar'];
  if (calendarToken === undefined) return undefined;
  return {
    services: createGoogleCalendarService({
      getAccessToken: async () => calendarToken.accessToken,
    }),
    orgId: payload.tenantID,
  };
}

const SSE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-master-key',
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
};

/* ─── MCP session management ─── */

type McpClient = Awaited<ReturnType<typeof createMCPClient>>;

async function connectMcpServer(transport: McpTransport): Promise<McpClient> {
  if (transport.type === 'http') {
    return await createMCPClient({
      transport: { type: 'http', url: transport.url, headers: transport.headers },
    });
  }
  if (transport.type === 'sse') {
    return await createMCPClient({
      transport: { type: 'sse', url: transport.url, headers: transport.headers },
    });
  }
  throw new Error(`Unsupported transport type in edge function: ${transport.type}`);
}

interface McpConnectionResult {
  tools: Record<string, Tool>;
  clients: McpClient[];
}

interface McpConnectionFailure {
  server: string;
  error: string;
}

interface McpValidationResult {
  success: McpConnectionResult | null;
  failures: McpConnectionFailure[];
}

async function attemptMcpConnection(
  server: McpServerConfig
): Promise<{ client: McpClient; tools: Record<string, Tool> }> {
  const client = await connectMcpServer(server.transport);
  await client.listTools();
  const tools = await client.tools();
  return { client, tools };
}

function buildMcpErrorMessage(failures: McpConnectionFailure[]): string {
  const details = failures.map((f) => `${f.server} (${f.error})`).join(', ');
  return `Failed to connect to MCP servers: ${details}`;
}

async function validateAndConnectMcpServers(servers: McpServerConfig[]): Promise<McpValidationResult> {
  const enabled = servers.filter((s) => s.enabled);
  if (enabled.length === 0) return { success: { tools: {}, clients: [] }, failures: [] };

  const results = await Promise.allSettled(enabled.map((server) => attemptMcpConnection(server)));

  const clients: McpClient[] = [];
  const allTools: Record<string, Tool> = {};
  const failures: McpConnectionFailure[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const server = enabled[i]!;
    if (result.status === 'fulfilled') {
      clients.push(result.value.client);
      Object.assign(allTools, result.value.tools);
    } else {
      const errMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
      failures.push({ server: server.name, error: errMsg });
    }
  }

  if (failures.length > 0) {
    await closeMcpClients(clients);
    return { success: null, failures };
  }

  return { success: { tools: allTools, clients }, failures: [] };
}

async function closeMcpClients(clients: McpClient[]): Promise<void> {
  await Promise.all(clients.map((c) => c.close().catch(() => {})));
}

/* ─── Lead scoring services (production only) ─── */

interface LeadScoringServices {
  setLeadScore: (score: number) => Promise<void>;
  getLeadScore: () => Promise<number | null>;
}

async function buildSupabaseForLeadScoring() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createClient(supabaseUrl, serviceKey);
}

async function setLeadScoreOnConversation(
  supabase: Awaited<ReturnType<typeof buildSupabaseForLeadScoring>>,
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
  supabase: Awaited<ReturnType<typeof buildSupabaseForLeadScoring>>,
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
  const supabase = await buildSupabaseForLeadScoring();
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
  supabase: Awaited<ReturnType<typeof buildSupabaseForLeadScoring>>,
  conversationId: string
): Promise<string | null> {
  const { data } = await supabase.from('conversations').select('agent_id').eq('id', conversationId).single();
  if (data === null) return null;
  return typeof data.agent_id === 'string' ? data.agent_id : null;
}

async function loadFormsForAgent(
  supabase: Awaited<ReturnType<typeof buildSupabaseForLeadScoring>>,
  agentId: string
): Promise<FormDefinition[]> {
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
  supabase: Awaited<ReturnType<typeof buildSupabaseForLeadScoring>>,
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
  supabase: Awaited<ReturnType<typeof buildSupabaseForLeadScoring>>,
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
  supabase: Awaited<ReturnType<typeof buildSupabaseForLeadScoring>>,
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

interface FormsBundle {
  services: FormsService;
  forms: FormDefinition[];
}

function buildPopulatedFormsService(
  supabase: Awaited<ReturnType<typeof buildSupabaseForLeadScoring>>,
  forms: FormDefinition[]
): FormsService {
  return {
    getFormDefinitions: () => Promise.resolve(forms),
    getFormData: (convId, formId) => readFormDataFromMetadata(supabase, convId, formId),
    applyFormFieldsAtomic: (args) => applyAtomicViaRpc(supabase, args.conversationId, args.form, args.fields),
    recordFailedAttempt: (convId, formId, attempt) => recordFailureViaRpc(supabase, convId, formId, attempt),
  };
}

function buildEmptyFormsService(
  supabase: Awaited<ReturnType<typeof buildSupabaseForLeadScoring>>
): FormsService {
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
  const supabase = await buildSupabaseForLeadScoring();
  const agentId = await loadAgentIdForConversation(supabase, conversationId);
  if (agentId === null) return undefined;
  const forms = await loadFormsForAgent(supabase, agentId);
  if (forms.length === 0) return { services: buildEmptyFormsService(supabase), forms: [] };
  return { services: buildPopulatedFormsService(supabase, forms), forms };
}

/* ─── Context builder ─── */

function buildContext(
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

/* ─── v2 Provider registry + ctx (Plan B+C+D Tasks 15+19) ─── */

interface BuildProviderCtxArgs {
  payload: ExecutePayload;
  conversationId?: string;
  formsBundle?: FormsBundle;
  leadScoringServices?: LeadScoringServices;
  calendarBundle?: CalendarBundle;
}

function buildServicesResolver(args: BuildProviderCtxArgs): (providerId: string) => unknown {
  const { formsBundle, leadScoringServices, calendarBundle } = args;
  return (providerId: string): unknown => {
    if (providerId === 'forms' && formsBundle !== undefined) {
      return { service: formsBundle.services, forms: formsBundle.forms };
    }
    if (providerId === 'lead_scoring' && leadScoringServices !== undefined) {
      return { service: leadScoringServices };
    }
    if (providerId === 'calendar' && calendarBundle !== undefined) {
      return { service: calendarBundle.services, calendarId: 'primary' };
    }
    return undefined;
  };
}

function buildProviderCtx(args: BuildProviderCtxArgs): ProviderCtx {
  const { payload, conversationId } = args;
  const oauthEntries: Array<[string, OAuthTokenBundle]> = Object.entries(payload.oauth?.byProvider ?? {});
  const mcpServerEntries: Array<[string, McpServerConfig]> = (payload.graph.mcpServers ?? []).map((s) => [
    s.id,
    s,
  ]);
  return {
    orgId: payload.tenantID,
    agentId: payload.sessionID,
    isChildAgent: payload.isChildAgent ?? false,
    logger: runnerLogger,
    conversationId,
    contextData: payload.data,
    oauthTokens: new Map<string, OAuthTokenBundle>(oauthEntries),
    mcpServers: new Map<string, McpServerConfig>(mcpServerEntries),
    services: buildServicesResolver(args),
  };
}

function buildRegistry(payload: ExecutePayload): Registry {
  return composeRegistry({
    builtIns: builtInProviders,
    orgMcpServers: payload.graph.mcpServers ?? [],
    logger: runnerLogger,
  });
}

async function buildToolsForAgentV2(
  payload: ExecutePayload,
  conversationId: string | undefined,
  formsBundle: FormsBundle | undefined,
  leadScoringServices: LeadScoringServices | undefined,
  calendarBundle: CalendarBundle | undefined
): Promise<Record<string, Tool>> {
  const registry = buildRegistry(payload);
  const ctx = buildProviderCtx({
    payload,
    conversationId,
    formsBundle,
    leadScoringServices,
    calendarBundle,
  });
  const built = await buildAgentToolsAtStart(registry, ctx, payload.selectedTools ?? []);
  return toAiSdkToolDict(built.tools);
}

/* ─── VFS bootstrap ─── */

interface VfsBootstrapResult {
  tools: Record<string, Tool>;
}

function buildSourceProvider(vfs: VfsPayloadData): InstanceType<typeof GitHubSourceProvider> {
  return new GitHubSourceProvider({
    token: vfs.token,
    owner: vfs.owner,
    repo: vfs.repo,
    commitSha: vfs.commitSha,
  });
}

function buildVfsContextConfig(
  vfs: VfsPayloadData,
  payload: ExecutePayload,
  sourceProvider: InstanceType<typeof GitHubSourceProvider>,
  supabaseClient: unknown,
  redisClient: unknown
) {
  return {
    tenantSlug: vfs.tenantSlug,
    agentSlug: vfs.agentSlug,
    userID: payload.userID,
    sessionId: payload.sessionID,
    commitSha: vfs.commitSha,
    sourceProvider,
    supabase: supabaseClient,
    redis: redisClient,
    protectedPaths: vfs.settings.protectedPaths,
    searchCandidateLimit: vfs.settings.searchCandidateLimit,
    readLineCeiling: vfs.settings.readLineCeiling,
    rateLimitThreshold: vfs.settings.rateLimitThreshold,
  };
}

async function bootstrapVfs(
  payload: ExecutePayload,
  context: Omit<Context, 'toolsOverride' | 'onNodeVisited' | 'onNodeProcessed'>
): Promise<VfsBootstrapResult | null> {
  if (payload.vfs === undefined) return null;

  const { createClient } = await import('@supabase/supabase-js');
  const { Redis } = await import('@upstash/redis');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL') ?? '';
  const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN') ?? '';

  const supabaseForVfs = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${payload.vfs.userJwt}` } },
  });
  const redis = new Redis({ url: redisUrl, token: redisToken });

  const sourceProvider = buildSourceProvider(payload.vfs);
  const config = buildVfsContextConfig(payload.vfs, payload, sourceProvider, supabaseForVfs, redis);
  const vfsContext = new VFSContext(config);
  await vfsContext.initialize();

  const tools = generateVFSTools(context, vfsContext);
  return { tools };
}

/* ─── Token summation ─── */

function sumTokens(result: CallAgentOutput): { input: number; output: number; cached: number; cost: number } {
  let input = 0,
    output = 0,
    cached = 0,
    cost = 0;
  for (const log of result.tokensLogs) {
    input += log.tokens.input;
    output += log.tokens.output;
    cached += log.tokens.cached;
    cost += log.tokens.costUSD ?? 0;
  }
  return { input, output, cached, cost };
}

/* ─── Auth ─── */

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let mismatch = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    mismatch |= bufA[i]! ^ bufB[i]!;
  }
  return mismatch === 0;
}

const SUPPORTED_SCHEMA_VERSIONS: ReadonlyArray<1 | 2> = [1, 2];

function validateSchemaVersion(schemaVersion: unknown): Response | null {
  if (schemaVersion === undefined) return null;
  if (typeof schemaVersion === 'number' && SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion as 1 | 2)) {
    return null;
  }
  return new Response(JSON.stringify({ error: `unsupported schemaVersion: ${String(schemaVersion)}` }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authenticateRequest(req: Request): Response | null {
  const masterKey = Deno.env.get('EDGE_FUNCTION_MASTER_KEY');
  if (masterKey === undefined || masterKey === '') {
    return new Response('Server misconfigured', { status: 500 });
  }

  const token = req.headers.get('x-master-key') ?? '';

  if (token === '' || !timingSafeEqual(token, masterKey)) {
    return new Response('Unauthorized', { status: 401 });
  }

  return null;
}

/* ─── Logging ─── */

const log = {
  info: (msg: string) => console.info(`[edge] ${msg}`),
  error: (msg: string) => console.error(`[edge] ${msg}`),
  debug: (msg: string) => console.debug(`[edge] ${msg}`),
  warn: (msg: string) => console.warn(`[edge] ${msg}`),
};

function prefixed(fn: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return (...args: unknown[]) => fn('[runner]', ...args);
}

const runnerLogger: Logger = {
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

/* ─── Agent loop execution ─── */

type WriteEvent = (event: Record<string, unknown>) => void;

async function runAgentExecution(
  payload: ExecutePayload,
  allTools: Record<string, Tool>,
  write: WriteEvent,
  leadScoringServices?: LeadScoringServices,
  formsBundle?: FormsBundle,
  conversationId?: string,
  calendarBundle?: CalendarBundle
): Promise<void> {
  log.info(
    `agent start model=${payload.modelId} msgs=${payload.messages.length} tools=${Object.keys(allTools).length} prompt=${(payload.systemPrompt ?? '').slice(0, 80)}`
  );

  const isV2 = payload.schemaVersion === 2;
  const tools = isV2
    ? await buildToolsForAgentV2(payload, conversationId, formsBundle, leadScoringServices, calendarBundle)
    : injectSystemTools({
        existingTools: allTools,
        isChildAgent: payload.isChildAgent ?? false,
        leadScoringServices,
        formsServices: formsBundle?.services,
        forms: formsBundle?.forms,
        conversationId,
        contextData: payload.data,
        calendarServices: calendarBundle?.services,
        orgId: calendarBundle?.orgId,
      });

  const result = await executeAgentLoop(
    {
      systemPrompt: payload.systemPrompt ?? '',
      context: payload.context ?? '',
      messages: payload.messages,
      apiKey: payload.apiKey,
      modelId: payload.modelId,
      maxSteps: payload.maxSteps ?? null,
      tools,
      isChildAgent: payload.isChildAgent ?? false,
    },
    {
      onStepStarted: (step: number) => {
        log.debug(`step ${step} started`);
        write({ type: 'step_started', step });
      },
      onStepProcessed: (event: AgentStepEvent) => {
        log.info(
          `step ${event.step} done text=${event.responseText.length}chars tools=${event.toolCalls.length} tokens=${JSON.stringify(event.tokens)} dur=${event.durationMs}ms`
        );
        write({
          type: 'step_processed',
          step: event.step,
          responseText: event.responseText,
          responseMessages: event.responseMessages,
          reasoning: event.reasoning,
          toolCalls: event.toolCalls,
          tokens: event.tokens,
          durationMs: event.durationMs,
          error: event.error,
        });
      },
    },
    runnerLogger
  );

  log.info(
    `agent done text=${result.finalText.length}chars steps=${result.steps} tokens=${JSON.stringify(result.totalTokens)}`
  );

  write({
    type: 'agent_response',
    text: result.finalText,
    steps: result.steps,
    totalTokens: result.totalTokens,
    toolCalls: result.toolCalls,
    tokensLogs: result.tokensLogs,
    finishResult: result.finishResult,
    dispatchResult: result.dispatchResult,
  });
}

/* ─── Workflow execution ─── */

interface WorkflowToolsBundle {
  leadScoringServices?: LeadScoringServices;
  formsBundle?: FormsBundle;
  conversationId?: string;
  calendarBundle?: CalendarBundle;
}

function buildV1WorkflowToolsOverride(
  payload: ExecutePayload,
  allTools: Record<string, Tool>,
  bundle: WorkflowToolsBundle
): Record<string, Tool> {
  return injectSystemTools({
    existingTools: allTools,
    isChildAgent: false,
    leadScoringServices: bundle.leadScoringServices,
    formsServices: bundle.formsBundle?.services,
    forms: bundle.formsBundle?.forms,
    conversationId: bundle.conversationId,
    contextData: payload.data,
    calendarServices: bundle.calendarBundle?.services,
    orgId: bundle.calendarBundle?.orgId,
  });
}

function buildV2WorkflowContext(
  payload: ExecutePayload,
  baseContext: Omit<Context, 'toolsOverride' | 'onNodeVisited' | 'onNodeProcessed'>,
  bundle: WorkflowToolsBundle
): Context {
  const registry = buildRegistry(payload);
  const ctx = buildProviderCtx({
    payload,
    conversationId: bundle.conversationId,
    formsBundle: bundle.formsBundle,
    leadScoringServices: bundle.leadScoringServices,
    calendarBundle: bundle.calendarBundle,
  });
  return {
    ...baseContext,
    registry,
    orgId: ctx.orgId,
    agentId: ctx.agentId,
    isChildAgent: ctx.isChildAgent,
    conversationId: ctx.conversationId,
    contextData: ctx.contextData,
    oauthTokens: ctx.oauthTokens,
    mcpServers: ctx.mcpServers,
    services: ctx.services,
    logger: runnerLogger,
  };
}

async function runWorkflowExecution(
  payload: ExecutePayload,
  allTools: Record<string, Tool>,
  write: WriteEvent,
  leadScoringServices?: LeadScoringServices,
  formsBundle?: FormsBundle,
  conversationId?: string,
  calendarBundle?: CalendarBundle
): Promise<void> {
  const baseContext = buildContext(payload);
  const bundle: WorkflowToolsBundle = { leadScoringServices, formsBundle, conversationId, calendarBundle };
  const isV2 = payload.schemaVersion === 2;
  const context: Context = isV2 ? buildV2WorkflowContext(payload, baseContext, bundle) : baseContext;
  const toolsOverride = isV2 ? undefined : buildV1WorkflowToolsOverride(payload, allTools, bundle);

  const result = await executeWithCallbacks({
    context,
    logger: runnerLogger,
    messages: payload.messages,
    currentNode: payload.currentNodeId,
    toolsOverride,
    structuredOutputs: payload.structuredOutputs,
    onNodeVisited: (nodeId: string) => {
      write({ type: 'node_visited', nodeId });
    },
    onNodeProcessed: (event: NodeProcessedEvent) => {
      write({
        type: 'node_processed',
        nodeId: event.nodeId,
        text: event.text ?? '',
        output: event.output,
        toolCalls: event.toolCalls.map((tc) => ({
          toolName: tc.toolName,
          input: tc.input,
          output: tc.output,
        })),
        reasoning: event.reasoning,
        error: event.error,
        tokens: event.tokens,
        durationMs: event.durationMs,
        structuredOutput: event.structuredOutput,
        responseMessages: event.responseMessages,
      });
    },
  });

  if (result !== null) {
    const tokens = sumTokens(result);
    write({
      type: 'agent_response',
      text: result.text ?? '',
      visitedNodes: result.visitedNodes,
      toolCalls: result.toolCalls.map((tc) => ({
        toolName: tc.toolName,
        input: tc.input,
        output: undefined,
      })),
      nodeTokens: result.tokensLogs.map((l) => ({ node: l.action, tokens: l.tokens })),
      tokenUsage: tokens,
      debugMessages: result.debugMessages,
      structuredOutputs: result.structuredOutputs,
      parsedResults: result.parsedResults,
      dispatchResult: result.dispatchResult,
      finishResult: result.finishResult,
    });
  }
}

/* ─── Main handler ─── */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: SSE_HEADERS });
  }

  const authError = authenticateRequest(req);
  if (authError !== null) return authError;

  const payload: ExecutePayload = await req.json();
  const schemaVersionError = validateSchemaVersion(payload.schemaVersion);
  if (schemaVersionError !== null) return schemaVersionError;
  const isAgent = payload.appType === 'agent';
  log.info(
    `request appType=${payload.appType ?? 'workflow'} model=${payload.modelId} schemaVersion=${payload.schemaVersion ?? 1}`
  );
  const mcpServers = isAgent ? [] : (payload.graph.mcpServers ?? []);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const write: WriteEvent = (event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      let clients: McpClient[] = [];

      try {
        const validation = await validateAndConnectMcpServers(mcpServers);

        if (validation.success === null) {
          write({ type: 'error', message: buildMcpErrorMessage(validation.failures) });
          return;
        }

        clients = validation.success.clients;
        const allTools: Record<string, Tool> = { ...validation.success.tools };

        if (!isAgent) {
          const vfsResult = await bootstrapVfs(payload, buildContext(payload));
          if (vfsResult !== null) {
            Object.assign(allTools, vfsResult.tools);
          }
        }

        // Build lead scoring services when we have a real conversation
        const leadScoringServices =
          payload.conversationId !== undefined
            ? await buildLeadScoringServices(payload.conversationId)
            : undefined;

        const formsBundle =
          payload.conversationId !== undefined ? await buildFormsBundle(payload.conversationId) : undefined;

        const calendarBundle =
          payload.schemaVersion === 2 ? buildCalendarBundleV2(payload) : buildCalendarBundle(payload);

        if (isAgent) {
          await runAgentExecution(
            payload,
            allTools,
            write,
            leadScoringServices,
            formsBundle,
            payload.conversationId,
            calendarBundle
          );
        } else {
          await runWorkflowExecution(
            payload,
            allTools,
            write,
            leadScoringServices,
            formsBundle,
            payload.conversationId,
            calendarBundle
          );
        }

        write({ type: 'execution_complete' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Execution failed';
        log.error(message);
        write({ type: 'error', message });
      } finally {
        await closeMcpClients(clients);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
});
