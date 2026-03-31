import type { SupabaseClient } from '@supabase/supabase-js';

import type { GitHubRepo } from '../../github/types.js';

const EMPTY_LENGTH = 0;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

interface RepoInsertRow {
  installation_id: number;
  repo_id: number;
  repo_full_name: string;
  private: boolean;
}

function toInsertRow(installationId: number, repo: GitHubRepo): RepoInsertRow {
  return {
    installation_id: installationId,
    repo_id: repo.id,
    repo_full_name: repo.full_name,
    private: repo.private,
  };
}

/* ------------------------------------------------------------------ */
/*  Sync                                                               */
/* ------------------------------------------------------------------ */

async function deleteExistingRepos(supabase: SupabaseClient, installationId: number): Promise<void> {
  const { error } = await supabase
    .from('github_installation_repos')
    .delete()
    .eq('installation_id', installationId);

  if (error !== null) {
    throw new Error(`Failed to delete existing repos: ${error.message}`);
  }
}

async function insertRepoRows(supabase: SupabaseClient, rows: RepoInsertRow[]): Promise<void> {
  const { error } = await supabase.from('github_installation_repos').insert(rows);

  if (error !== null) {
    throw new Error(`Failed to insert repos: ${error.message}`);
  }
}

/**
 * Sync the full repo list for an installation.
 * Deletes existing repos and inserts the new list.
 */
export async function syncRepos(
  supabase: SupabaseClient,
  installationId: number,
  repos: GitHubRepo[]
): Promise<void> {
  await deleteExistingRepos(supabase, installationId);
  if (repos.length === EMPTY_LENGTH) return;

  const rows = repos.map((repo) => toInsertRow(installationId, repo));
  await insertRepoRows(supabase, rows);
}

/* ------------------------------------------------------------------ */
/*  Add / Remove                                                       */
/* ------------------------------------------------------------------ */

/**
 * Add specific repos to an installation (webhook: repositories added).
 */
export async function addRepos(
  supabase: SupabaseClient,
  installationId: number,
  repos: GitHubRepo[]
): Promise<void> {
  if (repos.length === EMPTY_LENGTH) return;

  const rows = repos.map((repo) => toInsertRow(installationId, repo));
  const { error } = await supabase
    .from('github_installation_repos')
    .upsert(rows, { onConflict: 'installation_id,repo_id' });

  if (error !== null) {
    throw new Error(`Failed to add repos: ${error.message}`);
  }
}

/**
 * Remove specific repos from an installation (webhook: repositories removed).
 */
export async function removeRepos(
  supabase: SupabaseClient,
  installationId: number,
  repoIds: number[]
): Promise<void> {
  if (repoIds.length === EMPTY_LENGTH) return;

  const { error } = await supabase
    .from('github_installation_repos')
    .delete()
    .eq('installation_id', installationId)
    .in('repo_id', repoIds);

  if (error !== null) {
    throw new Error(`Failed to remove repos: ${error.message}`);
  }
}

/* ------------------------------------------------------------------ */
/*  VFS config cleanup                                                 */
/* ------------------------------------------------------------------ */

function isTableMissingError(message: string): boolean {
  return message.includes('does not exist');
}

/**
 * Delete agent_vfs_configs referencing an installation (cleanup on uninstall).
 * Note: agent_vfs_configs table is defined in Spec 5 — this is a forward reference.
 * If the table does not exist yet, this is a no-op (swallows error).
 */
export async function deleteVfsConfigsForInstallation(
  supabase: SupabaseClient,
  installationId: number
): Promise<void> {
  const { error } = await supabase.from('agent_vfs_configs').delete().eq('installation_id', installationId);

  if (error !== null && !isTableMissingError(error.message)) {
    throw new Error(`Failed to delete VFS configs: ${error.message}`);
  }
}

/**
 * Delete agent_vfs_configs referencing specific removed repos.
 */
export async function deleteVfsConfigsForRepos(
  supabase: SupabaseClient,
  installationId: number,
  repoIds: number[]
): Promise<void> {
  if (repoIds.length === EMPTY_LENGTH) return;

  const { error } = await supabase
    .from('agent_vfs_configs')
    .delete()
    .eq('installation_id', installationId)
    .in('repo_id', repoIds);

  if (error !== null && !isTableMissingError(error.message)) {
    throw new Error(`Failed to delete VFS configs for repos: ${error.message}`);
  }
}
