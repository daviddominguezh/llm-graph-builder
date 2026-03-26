import type { Request } from 'express';

import { TemplateCategorySchema } from '@daviddh/graph-types';

import { insertAgent } from '../../db/queries/agentQueries.js';
import { assembleTemplateSafeGraph } from '../../db/queries/assembleTemplateSafeGraph.js';
import { cloneTemplateGraph } from '../../db/queries/cloneTemplateGraph.js';
import { type SupabaseClient } from '../../db/queries/operationHelpers.js';
import { findUniqueSlug, generateSlug } from '../../db/queries/slugQueries.js';
import { getTemplateByAgentId, incrementDownloads } from '../../db/queries/templateQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../routeHelpers.js';
import { parseStringField } from './agentCrudHelpers.js';

/* ------------------------------------------------------------------ */
/*  Parsing helpers                                                    */
/* ------------------------------------------------------------------ */

function parseCategory(body: unknown): string {
  const raw = parseStringField(body, 'category');
  if (raw === undefined) return 'other';
  const parsed = TemplateCategorySchema.safeParse(raw);
  return parsed.success ? parsed.data : 'other';
}

function parseIsPublic(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'isPublic' in body && body.isPublic === true;
}

function parseTemplateVersion(body: unknown): number | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  if (!('templateVersion' in body)) return undefined;
  const raw = body.templateVersion;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Template cloning (fire-and-forget safe)                            */
/* ------------------------------------------------------------------ */

async function linkCreatedFromTemplate(
  supabase: SupabaseClient,
  agentId: string,
  templateId: string
): Promise<void> {
  await supabase.from('agents').update({ created_from_template_id: templateId }).eq('id', agentId);
}

async function cloneFromTemplate(
  supabase: SupabaseClient,
  agentId: string,
  templateAgentId: string,
  templateVersion: number
): Promise<void> {
  const graph = await assembleTemplateSafeGraph(supabase, templateAgentId, templateVersion);
  if (graph === null) return;

  await cloneTemplateGraph(supabase, agentId, graph);

  const { result: template } = await getTemplateByAgentId(supabase, templateAgentId);
  if (template !== null) {
    await linkCreatedFromTemplate(supabase, agentId, template.id);
    await incrementDownloads(supabase, template.id);
  }
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function handleCreateAgent(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const orgId = parseStringField(req.body, 'orgId');
  const name = parseStringField(req.body, 'name');
  const description = parseStringField(req.body, 'description');
  const category = parseCategory(req.body);
  const isPublic = parseIsPublic(req.body);
  const templateAgentId = parseStringField(req.body, 'templateAgentId');
  const templateVersion = parseTemplateVersion(req.body);

  if (orgId === undefined || name === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and name are required' });
    return;
  }

  const baseSlug = generateSlug(name);
  if (baseSlug === '') {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid agent name' });
    return;
  }

  try {
    const slug = await findUniqueSlug(supabase, baseSlug, 'agents');
    const { result, error } = await insertAgent(supabase, {
      orgId,
      name,
      slug,
      description: description ?? '',
      category,
      isPublic,
    });

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create agent' });
      return;
    }

    if (templateAgentId !== undefined && templateVersion !== undefined) {
      await cloneFromTemplate(supabase, result.id, templateAgentId, templateVersion);
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
