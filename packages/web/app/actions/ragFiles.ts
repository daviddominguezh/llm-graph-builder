'use server';

import {
  type CheckFilesResponse,
  type InitUploadInput,
  type InitUploadResponse,
  type ListFilesResponse,
  type RagChunkRow,
  type SearchMode,
  type SearchOptions,
  type SearchResponse,
  checkFiles as checkFilesLib,
  confirmUpload as confirmUploadLib,
  deleteFile as deleteFileLib,
  getChunks as getChunksLib,
  initUpload as initUploadLib,
  listFiles as listFilesLib,
  search as searchLib,
} from '@/app/lib/ragFiles';
import { serverError } from '@/app/lib/serverLogger';

export async function initUploadAction(
  input: InitUploadInput
): Promise<{ result: InitUploadResponse | null; error: string | null }> {
  const res = await initUploadLib(input);
  if (res.error !== null) serverError('[initUploadAction]', res.error);
  return res;
}

export async function confirmUploadAction(
  storeId: string,
  fileId: string
): Promise<{ error: string | null }> {
  const res = await confirmUploadLib(storeId, fileId);
  if (res.error !== null) serverError('[confirmUploadAction]', res.error);
  return res;
}

export async function listFilesAction(
  storeId: string,
  tenantId: string
): Promise<{ result: ListFilesResponse; error: string | null }> {
  return listFilesLib(storeId, tenantId);
}

export async function checkFilesAction(
  storeId: string,
  tenantId: string,
  digest: string
): Promise<{ result: CheckFilesResponse | null; error: string | null }> {
  return checkFilesLib(storeId, tenantId, digest);
}

export async function deleteFileAction(storeId: string, fileId: string): Promise<{ error: string | null }> {
  const res = await deleteFileLib(storeId, fileId);
  if (res.error !== null) serverError('[deleteFileAction]', res.error);
  return res;
}

export async function getChunksAction(
  storeId: string,
  fileId: string,
  page: number,
  pageSize: number
): Promise<{ result: RagChunkRow[]; error: string | null }> {
  return getChunksLib(storeId, fileId, page, pageSize);
}

export async function searchAction(
  storeId: string,
  tenantId: string,
  mode: SearchMode,
  query: string,
  options: SearchOptions = {}
): Promise<{ result: SearchResponse; error: string | null }> {
  return searchLib(storeId, tenantId, mode, query, options);
}
