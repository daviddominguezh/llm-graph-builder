import type { Graph } from '@daviddh/graph-types';

import type { VersionSummary } from '../../db/queries/versionQueries.js';
import {
  getVersionSnapshot,
  listVersions as listVersionsQuery,
  publishVersion,
} from '../../db/queries/versionQueries.js';
import { restoreVersion as restoreVersionQuery } from '../../db/queries/versionRestore.js';
import type { ServiceContext } from '../types.js';

export async function publishAgent(ctx: ServiceContext, agentId: string): Promise<{ version: number }> {
  const version = await publishVersion(ctx.supabase, agentId);
  return { version };
}

export async function listVersions(ctx: ServiceContext, agentId: string): Promise<VersionSummary[]> {
  return await listVersionsQuery(ctx.supabase, agentId);
}

export async function getVersion(ctx: ServiceContext, agentId: string, version: number): Promise<Graph> {
  const snapshot = await getVersionSnapshot(ctx.supabase, agentId, version);
  if (snapshot === null) throw new Error(`Version ${String(version)} not found`);
  return snapshot;
}

export async function restoreVersion(ctx: ServiceContext, agentId: string, version: number): Promise<Graph> {
  return await restoreVersionQuery(ctx.supabase, agentId, version);
}
