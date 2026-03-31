import { TemplateCategorySchema } from '@daviddh/graph-types';
import type { Request } from 'express';

import { insertAgent } from '../../db/queries/agentQueries.js';
import { assembleTemplateSafeGraph } from '../../db/queries/assembleTemplateSafeGraph.js';
import { updateBloomFilter } from '../../db/queries/bloomFilterQueries.js';
import { cloneAgentConfig } from '../../db/queries/cloneAgentConfig.js';
import { cloneTemplateGraph } from '../../db/queries/cloneTemplateGraph.js';
import type { SupabaseClient } from '../../db/queries/operationHelpers.js';
import { findUniqueSlug, generateSlug } from '../../db/queries/slugQueries.js';
import { getTemplateForClone, incrementDownloads } from '../../db/queries/templateQueries.js';
import { buildBitmask } from '../../utils/bloomFilter.js';
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

function parseCategory(body: unknown): string | undefined {
  const raw = parseStringField(body, 'category');
  if (raw === undefined) return undefined;
  const parsed = TemplateCategorySchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function parseIsPublic(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'isPublic' in body && body.isPublic === true;
}

function parseAppType(body: unknown): 'workflow' | 'agent' {
  if (typeof body === 'object' && body !== null && 'appType' in body && body.appType === 'agent') {
    return 'agent';
  }
  return 'workflow';
}

function parseTemplateVersion(body: unknown): number | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  if (!('templateVersion' in body)) return undefined;
  const { templateVersion: raw } = body;
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

async function cloneWorkflowTemplate(
  supabase: SupabaseClient,
  agentId: string,
  templateAgentId: string,
  templateVersion: number
): Promise<void> {
  const graph = await assembleTemplateSafeGraph(supabase, templateAgentId, templateVersion);
  if (graph === null) return;
  await cloneTemplateGraph(supabase, agentId, graph);
}

async function cloneFromTemplate(
  supabase: SupabaseClient,
  agentId: string,
  templateAgentId: string,
  templateVersion: number
): Promise<void> {
  const { result: template } = await getTemplateForClone(supabase, templateAgentId);
  if (template === null) return;

  if (template.app_type === 'agent') {
    await cloneAgentConfig(supabase, agentId, template.template_agent_config);
  } else {
    await cloneWorkflowTemplate(supabase, agentId, templateAgentId, templateVersion);
  }

  await linkCreatedFromTemplate(supabase, agentId, template.id);
  await incrementDownloads(supabase, template.id);
}

/* ------------------------------------------------------------------ */
/*  Request parsing                                                    */
/* ------------------------------------------------------------------ */

interface CreateAgentInput {
  orgId: string;
  name: string;
  description: string;
  category: string;
  isPublic: boolean;
  appType: 'workflow' | 'agent';
  systemPrompt: string | null;
  templateAgentId: string | undefined;
  templateVersion: number | undefined;
}

function parseCreateAgentBody(body: unknown): CreateAgentInput | null {
  const orgId = parseStringField(body, 'orgId');
  const name = parseStringField(body, 'name');
  const category = parseCategory(body);
  if (orgId === undefined || name === undefined || category === undefined) return null;

  const appType = parseAppType(body);
  return {
    orgId,
    name,
    description: parseStringField(body, 'description') ?? '',
    category,
    isPublic: parseIsPublic(body),
    appType,
    systemPrompt: appType === 'agent' ? '' : null,
    templateAgentId: parseStringField(body, 'templateAgentId'),
    templateVersion: parseTemplateVersion(body),
  };
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function handleCreateAgent(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const input = parseCreateAgentBody(req.body);

  if (input === null) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'orgId and name are required' });
    return;
  }

  const baseSlug = generateSlug(input.name);
  if (baseSlug === '') {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid agent name' });
    return;
  }

  try {
    const slug = await findUniqueSlug(supabase, baseSlug, 'agents');
    const { result, error } = await insertAgent(supabase, {
      orgId: input.orgId,
      name: input.name,
      slug,
      description: input.description,
      category: input.category,
      isPublic: input.isPublic,
      appType: input.appType,
      systemPrompt: input.systemPrompt,
    });

    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'Failed to create agent' });
      return;
    }

    await updateBloomFilter(supabase, buildBitmask(slug), 'agents');

    if (input.templateAgentId !== undefined && input.templateVersion !== undefined) {
      await cloneFromTemplate(supabase, result.id, input.templateAgentId, input.templateVersion);
    }

    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
