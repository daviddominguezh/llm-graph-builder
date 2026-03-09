'use server';

import {
  removeOrgAvatar as removeOrgAvatarLib,
  uploadOrgAvatar as uploadOrgAvatarLib,
} from '@/app/lib/org-storage';
import type { OrgRow, OrgWithAgentCount } from '@/app/lib/orgs';
import {
  createOrg as createOrgLib,
  deleteOrg as deleteOrgLib,
  getOrgsByUser,
  updateOrgAvatar as updateOrgAvatarLib,
  updateOrgName as updateOrgNameLib,
} from '@/app/lib/orgs';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { createClient } from '@/app/lib/supabase/server';

export async function createOrgAction(
  name: string
): Promise<{ result: OrgRow | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  serverLog('[createOrgAction] name:', name, 'user:', user?.id ?? 'NOT AUTHENTICATED');
  const res = await createOrgLib(supabase, name);
  if (res.error === null) serverLog('[createOrgAction] created org:', res.result?.slug);
  else serverError('[createOrgAction] error:', res.error);
  return res;
}

export async function updateOrgNameAction(
  orgId: string,
  name: string
): Promise<{ result: string | null; error: string | null }> {
  serverLog('[updateOrgNameAction] orgId:', orgId, 'name:', name);
  const supabase = await createClient();
  const res = await updateOrgNameLib(supabase, orgId, name);
  if (res.error !== null) serverError('[updateOrgNameAction] error:', res.error);
  return res;
}

export async function deleteOrgAction(orgId: string): Promise<{ error: string | null }> {
  serverLog('[deleteOrgAction] orgId:', orgId);
  const supabase = await createClient();
  const res = await deleteOrgLib(supabase, orgId);
  if (res.error !== null) serverError('[deleteOrgAction] error:', res.error);
  return res;
}

export async function uploadOrgAvatarAction(
  orgId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const file = formData.get('file');
  serverLog('[uploadOrgAvatarAction] orgId:', orgId, 'file:', file instanceof File ? file.name : 'none');
  if (!(file instanceof File)) return { error: 'No file provided' };

  const supabase = await createClient();
  const { result: url, error: uploadErr } = await uploadOrgAvatarLib(supabase, orgId, file);

  if (uploadErr !== null || url === null) {
    serverError('[uploadOrgAvatarAction] upload error:', uploadErr);
    return { error: uploadErr ?? 'Upload failed' };
  }

  serverLog('[uploadOrgAvatarAction] uploaded, url:', url);
  const res = await updateOrgAvatarLib(supabase, orgId, url);
  if (res.error !== null) serverError('[uploadOrgAvatarAction] update error:', res.error);
  return res;
}

export async function getOrgsAction(): Promise<{ result: OrgWithAgentCount[]; error: string | null }> {
  const supabase = await createClient();
  return await getOrgsByUser(supabase);
}

export async function removeOrgAvatarAction(orgId: string): Promise<{ error: string | null }> {
  serverLog('[removeOrgAvatarAction] orgId:', orgId);
  const supabase = await createClient();
  const { error: removeErr } = await removeOrgAvatarLib(supabase, orgId);

  if (removeErr !== null) {
    serverError('[removeOrgAvatarAction] remove error:', removeErr);
    return { error: removeErr };
  }

  const res = await updateOrgAvatarLib(supabase, orgId, null);
  if (res.error !== null) serverError('[removeOrgAvatarAction] update error:', res.error);
  return res;
}
