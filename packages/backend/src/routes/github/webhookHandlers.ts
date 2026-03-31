import type { SupabaseClient } from '@supabase/supabase-js';

import { updateInstallationStatus } from '../../db/queries/githubInstallationQueries.js';
import {
  addRepos,
  deleteVfsConfigsForInstallation,
  deleteVfsConfigsForRepos,
  removeRepos,
  syncRepos,
} from '../../db/queries/githubRepoQueries.js';
import { fetchInstallationRepos } from '../../github/githubApi.js';
import { mintInstallationToken } from '../../github/installationToken.js';
import type { WebhookInstallationPayload, WebhookInstallationReposPayload } from '../../github/types.js';
import { logGitHub } from './githubHelpers.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function syncRepoListForInstallation(supabase: SupabaseClient, installationId: number): Promise<void> {
  const tokenResponse = await mintInstallationToken(installationId);
  const repoList = await fetchInstallationRepos(tokenResponse.token);
  await syncRepos(supabase, installationId, repoList.repositories);
}

/* ------------------------------------------------------------------ */
/*  Installation event handlers                                        */
/* ------------------------------------------------------------------ */

export async function handleInstallationCreated(
  supabase: SupabaseClient,
  payload: WebhookInstallationPayload
): Promise<void> {
  const { installation } = payload;
  logGitHub('webhook', `installation.created id=${String(installation.id)}`);

  // If the installation already exists (created via callback flow), sync repos.
  // If it doesn't exist, we cannot determine the org_id from the webhook alone.
  // The callback flow always runs first and creates the record.
  const { data } = await supabase
    .from('github_installations')
    .select('org_id')
    .eq('installation_id', installation.id)
    .single();

  if (data !== null) {
    await syncRepoListForInstallation(supabase, installation.id);
  }
}

export async function handleInstallationDeleted(
  supabase: SupabaseClient,
  payload: WebhookInstallationPayload
): Promise<void> {
  const { installation } = payload;
  logGitHub('webhook', `installation.deleted id=${String(installation.id)}`);

  await deleteVfsConfigsForInstallation(supabase, installation.id);
  await updateInstallationStatus(supabase, installation.id, 'revoked');
}

export async function handleInstallationSuspend(
  supabase: SupabaseClient,
  payload: WebhookInstallationPayload
): Promise<void> {
  logGitHub('webhook', `installation.suspend id=${String(payload.installation.id)}`);
  await updateInstallationStatus(supabase, payload.installation.id, 'suspended');
}

export async function handleInstallationUnsuspend(
  supabase: SupabaseClient,
  payload: WebhookInstallationPayload
): Promise<void> {
  logGitHub('webhook', `installation.unsuspend id=${String(payload.installation.id)}`);
  await updateInstallationStatus(supabase, payload.installation.id, 'active');
}

/* ------------------------------------------------------------------ */
/*  Repository event handlers                                          */
/* ------------------------------------------------------------------ */

export async function handleReposAdded(
  supabase: SupabaseClient,
  payload: WebhookInstallationReposPayload
): Promise<void> {
  const { installation, repositories_added: addedRepos } = payload;
  logGitHub('webhook', `repos.added installation=${String(installation.id)}`);
  await addRepos(supabase, installation.id, addedRepos);
}

export async function handleReposRemoved(
  supabase: SupabaseClient,
  payload: WebhookInstallationReposPayload
): Promise<void> {
  const { installation, repositories_removed: removedRepos } = payload;
  const removedIds = removedRepos.map((r) => r.id);
  logGitHub('webhook', `repos.removed installation=${String(installation.id)}`);

  await deleteVfsConfigsForRepos(supabase, installation.id, removedIds);
  await removeRepos(supabase, installation.id, removedIds);
}
