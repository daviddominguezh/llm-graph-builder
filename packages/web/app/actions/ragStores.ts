'use server';

import {
  createRagStore as createRagStoreLib,
  deleteRagStore as deleteRagStoreLib,
  getRagStoresByOrg as getRagStoresByOrgLib,
  type RagStoreRow,
} from '@/app/lib/ragStores';
import { serverError, serverLog } from '@/app/lib/serverLogger';

export async function getRagStoresByOrgAction(
  orgId: string
): Promise<{ result: RagStoreRow[]; error: string | null }> {
  serverLog('[getRagStoresByOrgAction] orgId:', orgId);
  const res = await getRagStoresByOrgLib(orgId);
  if (res.error === null) serverLog('[getRagStoresByOrgAction] found', res.result.length, 'stores');
  else serverError('[getRagStoresByOrgAction] error:', res.error);
  return res;
}

export async function createRagStoreAction(
  orgId: string,
  name: string
): Promise<{ result: RagStoreRow | null; error: string | null }> {
  serverLog('[createRagStoreAction] orgId:', orgId, 'name:', name);
  const res = await createRagStoreLib(orgId, name);
  if (res.error === null) serverLog('[createRagStoreAction] created store:', res.result?.id);
  else serverError('[createRagStoreAction] error:', res.error);
  return res;
}

export async function deleteRagStoreAction(storeId: string): Promise<{ error: string | null }> {
  serverLog('[deleteRagStoreAction] storeId:', storeId);
  const res = await deleteRagStoreLib(storeId);
  if (res.error !== null) serverError('[deleteRagStoreAction] error:', res.error);
  return res;
}
