'use server';

import {
  type KvEntry,
  type KvStoreRow,
  createKvStore as createKvStoreLib,
  deleteKvStore as deleteKvStoreLib,
  getKvEntries as getKvEntriesLib,
  getKvStoresByOrg as getKvStoresByOrgLib,
  saveKvEntries as saveKvEntriesLib,
} from '@/app/lib/kvStores';
import { serverError, serverLog } from '@/app/lib/serverLogger';

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

export async function deleteKvStoreAction(storeId: string): Promise<{ error: string | null }> {
  serverLog('[deleteKvStoreAction] storeId:', storeId);
  const res = await deleteKvStoreLib(storeId);
  if (res.error !== null) serverError('[deleteKvStoreAction] error:', res.error);
  return res;
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
