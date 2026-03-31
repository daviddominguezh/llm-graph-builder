'use server';

import { fetchFromBackend } from '@/app/lib/backendProxy';
import { serverError, serverLog } from '@/app/lib/serverLogger';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface VfsConfigRow {
  id: number;
  agent_id: string;
  org_id: string;
  installation_id: number;
  repo_id: number;
  repo_full_name: string;
  created_at: string;
  updated_at: string;
  installation_status: 'active' | 'suspended' | 'revoked';
  account_name: string;
  repo_exists: boolean;
}

export interface AgentVfsSettings {
  enabled: boolean;
  protectedPaths?: string[];
  searchCandidateLimit?: number;
  readLineCeiling?: number;
  rateLimitThreshold?: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

/* ------------------------------------------------------------------ */
/*  VFS Config CRUD                                                    */
/* ------------------------------------------------------------------ */

export async function fetchVfsConfigs(agentId: string): Promise<VfsConfigRow[]> {
  try {
    const path = `/agents/${encodeURIComponent(agentId)}/vfs-configs`;
    const data = await fetchFromBackend('GET', path);
    return Array.isArray(data) ? (data as VfsConfigRow[]) : [];
  } catch (err) {
    serverError('[fetchVfsConfigs]', extractError(err));
    return [];
  }
}

export async function upsertVfsConfigAction(
  agentId: string,
  orgId: string,
  installationId: number,
  repoId: number,
  repoFullName: string
): Promise<{ error: string | null }> {
  serverLog('[upsertVfsConfig]', `agent=${agentId} org=${orgId}`);
  try {
    const path = `/agents/${encodeURIComponent(agentId)}/vfs-configs/${encodeURIComponent(orgId)}`;
    await fetchFromBackend('PUT', path, { installationId, repoId, repoFullName });
    return { error: null };
  } catch (err) {
    const message = extractError(err);
    serverError('[upsertVfsConfig]', message);
    return { error: message };
  }
}

export async function deleteVfsConfigAction(
  agentId: string,
  orgId: string
): Promise<{ error: string | null }> {
  serverLog('[deleteVfsConfig]', `agent=${agentId} org=${orgId}`);
  try {
    const path = `/agents/${encodeURIComponent(agentId)}/vfs-configs/${encodeURIComponent(orgId)}`;
    await fetchFromBackend('DELETE', path);
    return { error: null };
  } catch (err) {
    const message = extractError(err);
    serverError('[deleteVfsConfig]', message);
    return { error: message };
  }
}

/* ------------------------------------------------------------------ */
/*  VFS Settings                                                       */
/* ------------------------------------------------------------------ */

interface VfsSettingsResponse {
  settings: AgentVfsSettings | null;
}

export async function fetchVfsSettings(agentId: string): Promise<AgentVfsSettings | null> {
  try {
    const path = `/agents/${encodeURIComponent(agentId)}/vfs-settings`;
    const data = (await fetchFromBackend('GET', path)) as VfsSettingsResponse;
    return data.settings ?? null;
  } catch (err) {
    serverError('[fetchVfsSettings]', extractError(err));
    return null;
  }
}

export async function updateVfsSettingsAction(
  agentId: string,
  settings: AgentVfsSettings | null
): Promise<{ error: string | null }> {
  serverLog('[updateVfsSettings]', `agent=${agentId}`);
  try {
    const path = `/agents/${encodeURIComponent(agentId)}/vfs-settings`;
    await fetchFromBackend('PATCH', path, settings);
    return { error: null };
  } catch (err) {
    const message = extractError(err);
    serverError('[updateVfsSettings]', message);
    return { error: message };
  }
}

/* ------------------------------------------------------------------ */
/*  GitHub connect URL                                                 */
/* ------------------------------------------------------------------ */

interface ConnectUrlResponse {
  authorizeUrl: string;
}

export async function getGitHubConnectUrl(orgId: string): Promise<string | null> {
  try {
    const data = (await fetchFromBackend('POST', '/github/initiate', { orgId })) as ConnectUrlResponse;
    return data.authorizeUrl;
  } catch (err) {
    serverError('[getGitHubConnectUrl]', extractError(err));
    return null;
  }
}
