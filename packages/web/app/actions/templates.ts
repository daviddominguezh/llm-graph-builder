'use server';

import { serverError, serverLog } from '@/app/lib/serverLogger';
import type { BrowseTemplateParams, TemplateListItem, TemplateVersionSummary } from '@/app/lib/templates';
import {
  browseTemplates as browseTemplatesLib,
  getTemplateVersions as getTemplateVersionsLib,
} from '@/app/lib/templates';
import type { TemplateGraphData } from '@daviddh/graph-types';

export async function browseTemplatesAction(
  params?: BrowseTemplateParams
): Promise<{ templates: TemplateListItem[]; error: string | null }> {
  serverLog('[browseTemplatesAction] params:', params);
  const res = await browseTemplatesLib(params);
  if (res.error !== null) serverError('[browseTemplatesAction] error:', res.error);
  return res;
}

export async function getTemplateVersionsAction(
  agentId: string
): Promise<{ versions: TemplateVersionSummary[]; error: string | null }> {
  serverLog('[getTemplateVersionsAction] agentId:', agentId);
  const res = await getTemplateVersionsLib(agentId);
  if (res.error !== null) serverError('[getTemplateVersionsAction] error:', res.error);
  return res;
}

export async function getTemplateSnapshotAction(
  agentId: string,
  version: number
): Promise<{ graphData: TemplateGraphData | null; error: string | null }> {
  serverLog('[getTemplateSnapshotAction] agentId:', agentId, 'version:', version);
  const { getTemplateSnapshot } = await import('@/app/lib/templates');
  const res = await getTemplateSnapshot(agentId, version);
  if (res.error !== null) serverError('[getTemplateSnapshotAction] error:', res.error);
  return res;
}
