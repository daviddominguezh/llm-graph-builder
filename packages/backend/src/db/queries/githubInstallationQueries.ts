import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UpsertInstallationParams {
  installationId: number;
  orgId: string;
  accountName: string;
  accountType: 'Organization' | 'User';
}

interface InstallationLookupRow {
  installation_id: number;
  org_id: string;
}

/* ------------------------------------------------------------------ */
/*  Mutations                                                          */
/* ------------------------------------------------------------------ */

export async function upsertInstallation(
  supabase: SupabaseClient,
  params: UpsertInstallationParams
): Promise<void> {
  const { error } = await supabase.from('github_installations').upsert(
    {
      installation_id: params.installationId,
      org_id: params.orgId,
      account_name: params.accountName,
      account_type: params.accountType,
      status: 'active',
    },
    { onConflict: 'installation_id' }
  );

  if (error !== null) {
    throw new Error(`Failed to upsert installation: ${error.message}`);
  }
}

export async function updateInstallationStatus(
  supabase: SupabaseClient,
  installationId: number,
  status: 'active' | 'suspended' | 'revoked'
): Promise<void> {
  const { error } = await supabase
    .from('github_installations')
    .update({ status })
    .eq('installation_id', installationId);

  if (error !== null) {
    throw new Error(`Failed to update installation status: ${error.message}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export async function getInstallationOrgId(
  supabase: SupabaseClient,
  installationId: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from('github_installations')
    .select('installation_id, org_id')
    .eq('installation_id', installationId)
    .single();

  if (error !== null) return null;
  const row = data as InstallationLookupRow;
  return row.org_id;
}
