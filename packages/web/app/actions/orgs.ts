'use server';

import {
  removeOrgAvatar as removeOrgAvatarLib,
  uploadOrgAvatar as uploadOrgAvatarLib,
} from '@/app/lib/org-storage';
import type { OrgRow } from '@/app/lib/orgs';
import {
  createOrg as createOrgLib,
  deleteOrg as deleteOrgLib,
  updateOrgAvatar as updateOrgAvatarLib,
  updateOrgName as updateOrgNameLib,
} from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/server';

export async function createOrgAction(
  name: string
): Promise<{ result: OrgRow | null; error: string | null }> {
  const supabase = await createClient();
  return await createOrgLib(supabase, name);
}

export async function updateOrgNameAction(
  orgId: string,
  name: string
): Promise<{ result: string | null; error: string | null }> {
  const supabase = await createClient();
  return await updateOrgNameLib(supabase, orgId, name);
}

export async function deleteOrgAction(orgId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  return await deleteOrgLib(supabase, orgId);
}

export async function uploadOrgAvatarAction(
  orgId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const file = formData.get('file');
  if (!(file instanceof File)) return { error: 'No file provided' };

  const supabase = await createClient();
  const { result: url, error: uploadErr } = await uploadOrgAvatarLib(supabase, orgId, file);

  if (uploadErr !== null || url === null) return { error: uploadErr ?? 'Upload failed' };

  return await updateOrgAvatarLib(supabase, orgId, url);
}

export async function removeOrgAvatarAction(orgId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error: removeErr } = await removeOrgAvatarLib(supabase, orgId);

  if (removeErr !== null) return { error: removeErr };

  return await updateOrgAvatarLib(supabase, orgId, null);
}
