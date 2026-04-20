import type { Request } from 'express';

import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { loadConnectionCredentials } from './credentialsHelper.js';
import { deleteMetaTemplate } from './metaTemplateApi.js';

const { console: stdout } = globalThis;

interface TemplateRow {
  id: string;
  org_id: string;
  channel_connection_id: string;
  meta_template_id: string | null;
  name: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toTemplateRow(value: unknown): TemplateRow | null {
  if (!isRecord(value)) return null;
  const {
    id,
    org_id: orgId,
    channel_connection_id: channelConnectionId,
    meta_template_id: metaTemplateId,
    name,
  } = value;
  if (
    typeof id !== 'string' ||
    typeof orgId !== 'string' ||
    typeof channelConnectionId !== 'string' ||
    typeof name !== 'string'
  ) {
    return null;
  }
  const metaId = typeof metaTemplateId === 'string' ? metaTemplateId : null;
  return { id, org_id: orgId, channel_connection_id: channelConnectionId, meta_template_id: metaId, name };
}

function getParams(req: Request): { orgId?: string; templateId?: string } {
  const orgIdParam: unknown = req.params.orgId;
  const templateIdParam: unknown = req.params.templateId;
  return {
    orgId: typeof orgIdParam === 'string' ? orgIdParam : undefined,
    templateId: typeof templateIdParam === 'string' ? templateIdParam : undefined,
  };
}

async function fetchTemplate(
  supabase: SupabaseClient,
  templateId: string,
  orgId: string
): Promise<TemplateRow | null> {
  const result = await supabase
    .from('whatsapp_templates')
    .select('id, org_id, channel_connection_id, meta_template_id, name')
    .eq('id', templateId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (result.error !== null) return null;
  return toTemplateRow(result.data);
}

async function cleanupMetaTemplate(
  supabase: SupabaseClient,
  template: TemplateRow,
  orgId: string
): Promise<void> {
  try {
    const credentials = await loadConnectionCredentials(supabase, template.channel_connection_id, orgId);
    await deleteMetaTemplate({
      wabaId: credentials.wabaId,
      accessToken: credentials.accessToken,
      name: template.name,
      hsmId: template.meta_template_id,
    });
  } catch (err) {
    stdout.warn('[whatsapp-templates] DB row deleted but Meta cleanup failed:', err);
  }
}

/**
 * DELETE /orgs/:orgId/whatsapp-templates/:templateId
 * Deletes the DB row first (RLS rejects non-admins), then best-effort deletes
 * the template on Meta.
 */
export async function handleDeleteTemplate(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { orgId, templateId } = getParams(req);
  if (orgId === undefined || templateId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Missing orgId or templateId parameter' });
    return;
  }

  const { supabase }: AuthenticatedLocals = res.locals;

  try {
    const template = await fetchTemplate(supabase, templateId, orgId);
    if (template === null) {
      res.status(HTTP_NOT_FOUND).json({ error: 'Template not found' });
      return;
    }

    const deleteResult = await supabase.from('whatsapp_templates').delete().eq('id', templateId);
    if (deleteResult.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: deleteResult.error.message });
      return;
    }

    await cleanupMetaTemplate(supabase, template, orgId);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
