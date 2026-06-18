'use server';

import { fetchFromBackend } from '@/app/lib/backendProxy';
import {
  type KvEntry,
  type KvStoreRow,
  createKvStore as createKvStoreLib,
  getKvEntries as getKvEntriesLib,
  getKvStoresByOrg as getKvStoresByOrgLib,
  saveKvEntries as saveKvEntriesLib,
  updateKvStore as updateKvStoreLib,
} from '@/app/lib/kvStores';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { type DeleteStoreResult, buildDeleteFailure } from '@/app/lib/storeDeleteResult';

export type { AgentRef, DeleteStoreResult } from '@/app/lib/storeDeleteResult';

export async function getKvStoresByOrgAction(
  orgId: string
): Promise<{ result: KvStoreRow[]; error: string | null }> {
  serverLog('[getKvStoresByOrgAction] orgId:', orgId);
  const res = await getKvStoresByOrgLib(orgId);
  if (res.error === null) serverLog('[getKvStoresByOrgAction] found', res.result.length, 'stores');
  else serverError('[getKvStoresByOrgAction] error:', res.error);
  return res;
}

export async function createKvStoreAction(
  orgId: string,
  name: string
): Promise<{ result: KvStoreRow | null; error: string | null }> {
  serverLog('[createKvStoreAction] orgId:', orgId, 'name:', name);
  const res = await createKvStoreLib(orgId, name);
  if (res.error === null) serverLog('[createKvStoreAction] created store:', res.result?.id);
  else serverError('[createKvStoreAction] error:', res.error);
  return res;
}

export async function updateKvStoreAction(
  storeId: string,
  name: string
): Promise<{ result: KvStoreRow | null; error: string | null }> {
  serverLog('[updateKvStoreAction] storeId:', storeId, 'name:', name);
  const res = await updateKvStoreLib(storeId, name);
  if (res.error !== null) serverError('[updateKvStoreAction] error:', res.error);
  return res;
}

export async function deleteKvStoreAction(storeId: string): Promise<DeleteStoreResult> {
  serverLog('[deleteKvStoreAction] storeId:', storeId);
  try {
    await fetchFromBackend('DELETE', `/kv-stores/${encodeURIComponent(storeId)}`);
    return { ok: true };
  } catch (err) {
    const failure = buildDeleteFailure(err);
    serverError('[deleteKvStoreAction] failure:', failure);
    return failure;
  }
}

export async function getKvEntriesAction(
  storeId: string,
  tenantId: string
): Promise<{ result: KvEntry[]; error: string | null }> {
  const res = await getKvEntriesLib(storeId, tenantId);
  if (res.error !== null) serverError('[getKvEntriesAction] error:', res.error);
  return res;
}

export async function saveKvEntriesAction(
  storeId: string,
  tenantId: string,
  entries: KvEntry[]
): Promise<{ error: string | null }> {
  const res = await saveKvEntriesLib(storeId, tenantId, entries);
  if (res.error !== null) serverError('[saveKvEntriesAction] error:', res.error);
  return res;
}
