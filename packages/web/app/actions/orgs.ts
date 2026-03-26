'use server';

import { fetchFromBackend, uploadToBackend } from '@/app/lib/backendProxy';
import type { OrgRow, OrgWithAgentCount } from '@/app/lib/orgs';
import {
  createOrg as createOrgLib,
  deleteOrg as deleteOrgLib,
  getOrgsByUser,
  updateOrgName,
} from '@/app/lib/orgs';
import { serverError, serverLog } from '@/app/lib/serverLogger';

export async function createOrgAction(
  name: string
): Promise<{ result: OrgRow | null; error: string | null }> {
  serverLog('[createOrgAction] name:', name);
  const res = await createOrgLib(name);
  if (res.error === null) serverLog('[createOrgAction] created org:', res.result?.slug);
  else serverError('[createOrgAction] error:', res.error);
  return res;
}

export async function updateOrgNameAction(
  orgId: string,
  name: string
): Promise<{ result: string | null; error: string | null }> {
  serverLog('[updateOrgNameAction] orgId:', orgId, 'name:', name);
  const res = await updateOrgName(orgId, name);
  if (res.error !== null) serverError('[updateOrgNameAction] error:', res.error);
  return res;
}

export async function deleteOrgAction(orgId: string): Promise<{ error: string | null }> {
  serverLog('[deleteOrgAction] orgId:', orgId);
  const res = await deleteOrgLib(orgId);
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

  try {
    const backendForm = new FormData();
    backendForm.append('file', file);
    await uploadToBackend(`/orgs/${encodeURIComponent(orgId)}/avatar`, backendForm);
    serverLog('[uploadOrgAvatarAction] uploaded successfully');
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    serverError('[uploadOrgAvatarAction] error:', message);
    return { error: message };
  }
}

export async function getOrgsAction(): Promise<{ result: OrgWithAgentCount[]; error: string | null }> {
  return await getOrgsByUser();
}

export async function removeOrgAvatarAction(orgId: string): Promise<{ error: string | null }> {
  serverLog('[removeOrgAvatarAction] orgId:', orgId);
  try {
    await fetchFromBackend('DELETE', `/orgs/${encodeURIComponent(orgId)}/avatar`);
    serverLog('[removeOrgAvatarAction] removed successfully');
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Remove failed';
    serverError('[removeOrgAvatarAction] error:', message);
    return { error: message };
  }
}
