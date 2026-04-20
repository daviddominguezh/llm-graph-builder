/**
 * Meta WhatsApp Business Cloud API — message template endpoints.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
 */
import type { WhatsAppTemplateStatus, WhatsAppTemplateVariable } from './types.js';

const { console: stdout } = globalThis;

const FB_URL_VERSION = 'v23.0';
const GRAPH_BASE = `https://graph.facebook.com/${FB_URL_VERSION}`;
const REQUEST_TIMEOUT_MS = 15_000;
const EMPTY_ARRAY_LENGTH = 0;

export interface MetaTemplateCreateResult {
  id: string;
  status: string;
  category: string;
}

interface CreateTemplateParams {
  wabaId: string;
  accessToken: string;
  name: string;
  language: string;
  category: string;
  body: string;
  variables: WhatsAppTemplateVariable[];
}

function pickExample(variable: WhatsAppTemplateVariable): string {
  if (variable.example !== '') return variable.example;
  if (variable.name !== '') return variable.name;
  return variable.key;
}

/**
 * Meta expects example values for variables in the order 1..N.
 * Returns undefined when no variables are declared so the example field is omitted.
 */
function buildExample(variables: WhatsAppTemplateVariable[]): string[][] | undefined {
  if (variables.length === EMPTY_ARRAY_LENGTH) return undefined;

  const sorted = [...variables].sort((a, b) => Number(a.key) - Number(b.key));
  const examples = sorted.map(pickExample);
  return [examples];
}

function buildBodyComponent(body: string, variables: WhatsAppTemplateVariable[]): Record<string, unknown> {
  const component: Record<string, unknown> = { type: 'BODY', text: body };
  const example = buildExample(variables);
  if (example !== undefined) {
    component.example = { body_text: example };
  }
  return component;
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractNestedMessage(record: Record<string, unknown>): string | null {
  const { error, message } = record;
  if (isRecord(error)) {
    const { message: nested } = error;
    if (typeof nested === 'string') return nested;
  }
  if (typeof message === 'string') return message;
  return null;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string') return payload;
  if (isRecord(payload)) {
    const nested = extractNestedMessage(payload);
    if (nested !== null) return nested;
  }
  return fallback;
}

function isCreateResult(value: unknown): value is MetaTemplateCreateResult {
  if (!isRecord(value)) return false;
  const { id, status, category } = value;
  return typeof id === 'string' && typeof status === 'string' && typeof category === 'string';
}

async function postCreateTemplate(
  params: CreateTemplateParams
): Promise<{ response: Response; payload: unknown }> {
  const url = `${GRAPH_BASE}/${params.wabaId}/message_templates`;
  const body = {
    name: params.name,
    language: params.language,
    category: params.category.toUpperCase(),
    components: [buildBodyComponent(params.body, params.variables)],
  };

  stdout.log('[meta-template] Creating template:', params.name);

  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await parseJson(response);
  return { response, payload };
}

/**
 * Create a WhatsApp message template on Meta's WABA.
 * Returns the template id and initial approval status.
 */
export async function createMetaTemplate(params: CreateTemplateParams): Promise<MetaTemplateCreateResult> {
  const { response, payload } = await postCreateTemplate(params);

  if (!response.ok) {
    throw new Error(
      `Meta Graph API error (${String(response.status)}): ${extractErrorMessage(payload, 'unknown')}`
    );
  }

  if (!isCreateResult(payload)) {
    throw new Error('Meta Graph API returned an unexpected payload');
  }

  stdout.log(`[meta-template] Created template, id: ${payload.id}, status: ${payload.status}`);
  return payload;
}

interface DeleteTemplateParams {
  wabaId: string;
  accessToken: string;
  name: string;
  hsmId: string | null;
}

async function reportDeleteFailure(response: Response, name: string): Promise<void> {
  const payload = await parseJson(response);
  stdout.warn(
    `[meta-template] Delete failed for ${name} (${String(response.status)}):`,
    extractErrorMessage(payload, 'unknown')
  );
}

/**
 * Delete a template from Meta. Best-effort: never throws.
 */
export async function deleteMetaTemplate(params: DeleteTemplateParams): Promise<boolean> {
  const query = new URLSearchParams({ name: params.name });
  if (params.hsmId !== null) query.set('hsm_id', params.hsmId);

  const url = `${GRAPH_BASE}/${params.wabaId}/message_templates?${query.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });

    if (!response.ok) {
      await reportDeleteFailure(response, params.name);
      return false;
    }

    stdout.log(`[meta-template] Deleted template: ${params.name}`);
    return true;
  } catch (error) {
    stdout.warn(`[meta-template] Error deleting template ${params.name}:`, error);
    return false;
  }
}

interface MetaTemplateListEntry {
  id: string;
  name: string;
  status: string;
  category: string;
}

function toTemplateListEntry(value: unknown): MetaTemplateListEntry | null {
  if (!isRecord(value)) return null;
  const { id, name, status, category } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof status !== 'string') {
    return null;
  }
  const safeCategory = typeof category === 'string' ? category : '';
  return { id, name, status, category: safeCategory };
}

function extractListData(payload: unknown): MetaTemplateListEntry[] {
  if (!isRecord(payload)) return [];
  const { data } = payload;
  if (!Array.isArray(data)) return [];

  const entries: MetaTemplateListEntry[] = [];
  for (const raw of data) {
    const entry = toTemplateListEntry(raw);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

/**
 * List templates for a WABA to sync their approval statuses.
 */
export async function listMetaTemplates(
  wabaId: string,
  accessToken: string
): Promise<MetaTemplateListEntry[] | null> {
  const url = `${GRAPH_BASE}/${wabaId}/message_templates?fields=id,name,status,category&limit=200`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      stdout.warn(`[meta-template] List failed for WABA ${wabaId} (${String(response.status)})`);
      return null;
    }

    return extractListData(await parseJson(response));
  } catch (error) {
    stdout.warn(`[meta-template] Error listing templates for WABA ${wabaId}:`, error);
    return null;
  }
}

export function mapMetaStatus(metaStatus: string): WhatsAppTemplateStatus | null {
  const map: Record<string, WhatsAppTemplateStatus> = {
    APPROVED: 'approved',
    PENDING: 'pending',
    IN_APPEAL: 'pending',
    REJECTED: 'rejected',
    PAUSED: 'paused',
    DISABLED: 'deactivated',
    PENDING_DELETION: 'deactivated',
    DELETED: 'deactivated',
  };
  return map[metaStatus.toUpperCase()] ?? null;
}
