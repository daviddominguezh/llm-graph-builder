import type { Request } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { loadConnectionCredentials } from './credentialsHelper.js';
import { createMetaTemplate, mapMetaStatus } from './metaTemplateApi.js';
import type { CreateTemplateRequestBody, WhatsAppTemplateCategory, WhatsAppTemplateStatus } from './types.js';
import { validateBodyPlaceholders, validateCreateBody, validateVariableShape } from './validators.js';

function getTenantId(req: Request): string | undefined {
  const tenantIdParam: unknown = req.params.tenantId;
  return typeof tenantIdParam === 'string' ? tenantIdParam : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidCategory(value: unknown): value is WhatsAppTemplateCategory {
  return value === 'utility' || value === 'marketing' || value === 'authentication';
}

function toPartialBody(raw: unknown): Partial<CreateTemplateRequestBody> {
  if (!isRecord(raw)) return {};
  return raw as Partial<CreateTemplateRequestBody>;
}

function validateAll(body: Partial<CreateTemplateRequestBody>): string | null {
  const bodyError = validateCreateBody(body);
  if (bodyError !== null) return bodyError;
  if (!isValidCategory(body.category)) return 'Invalid category';
  const placeholderError = validateBodyPlaceholders(body.body ?? '');
  if (placeholderError !== null) return placeholderError;
  return validateVariableShape(body.variables ?? []);
}

function buildRequestBody(
  body: Partial<CreateTemplateRequestBody> & { category: WhatsAppTemplateCategory }
): CreateTemplateRequestBody {
  return {
    channelConnectionId: body.channelConnectionId ?? '',
    name: body.name ?? '',
    body: body.body ?? '',
    language: body.language ?? '',
    variables: body.variables ?? [],
    category: body.category,
    description: body.description ?? null,
  };
}

function parseCreateBody(raw: unknown): CreateTemplateRequestBody | { error: string } {
  const body = toPartialBody(raw);
  const error = validateAll(body);
  if (error !== null) return { error };
  if (!isValidCategory(body.category)) return { error: 'Invalid category' };
  return buildRequestBody({ ...body, category: body.category });
}

interface InsertParams {
  tenantId: string;
  body: CreateTemplateRequestBody;
  metaId: string;
  initialStatus: WhatsAppTemplateStatus;
}

async function insertTemplateRow(
  supabase: SupabaseClient,
  params: InsertParams
): Promise<{ data: unknown; error: { message: string } | null }> {
  const { tenantId, body, metaId, initialStatus } = params;
  const result = await supabase
    .from('whatsapp_templates')
    .insert({
      tenant_id: tenantId,
      channel_connection_id: body.channelConnectionId,
      meta_template_id: metaId,
      name: body.name,
      body: body.body,
      language: body.language === '' ? 'en' : body.language,
      variables: body.variables,
      category: body.category,
      description: body.description,
      status: initialStatus,
    })
    .select()
    .single();
  return { data: result.data, error: result.error };
}

async function callMetaAndInsert(
  supabase: SupabaseClient,
  tenantId: string,
  body: CreateTemplateRequestBody
): Promise<{ status: number; body: unknown }> {
  const credentials = await loadConnectionCredentials(supabase, body.channelConnectionId, tenantId);

  const metaResult = await createMetaTemplate({
    wabaId: credentials.wabaId,
    accessToken: credentials.accessToken,
    name: body.name,
    language: body.language === '' ? 'en' : body.language,
    category: body.category,
    body: body.body,
    variables: body.variables,
  });

  const initialStatus = mapMetaStatus(metaResult.status) ?? 'pending';
  const insertResult = await insertTemplateRow(supabase, {
    tenantId,
    body,
    metaId: metaResult.id,
    initialStatus,
  });

  if (insertResult.error !== null) {
    return {
      status: HTTP_INTERNAL_ERROR,
      body: {
        error: `Template created on Meta (${metaResult.id}) but DB insert failed: ${insertResult.error.message}`,
      },
    };
  }

  return { status: HTTP_OK, body: { template: insertResult.data } };
}

/**
 * POST /tenants/:tenantId/whatsapp-templates
 * Creates a template on Meta's WABA and stores metadata locally.
 * RLS enforces that only org owners/admins can insert.
 */
export async function handleCreateTemplate(req: Request, res: AuthenticatedResponse): Promise<void> {
  const tenantId = getTenantId(req);
  if (tenantId === undefined) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: 'Missing tenantId parameter' });
    return;
  }

  const parsed = parseCreateBody(req.body);
  if ('error' in parsed) {
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const result = await callMetaAndInsert(supabase, tenantId, parsed);
    res.status(result.status).json(result.body);
  } catch (err) {
    res.status(HTTP_BAD_REQUEST).json({ error: extractErrorMessage(err) });
  }
}
