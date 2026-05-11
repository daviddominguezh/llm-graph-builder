import type { SupabaseClient } from '@supabase/supabase-js';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';

import { createPendingFile } from '../../../db/queries/ragFilesQueries.js';
import { createUploadSignedUrl } from '../../../rag/gcs.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getStoreIdParam, parseNumber, parseString } from './ragFileHelpers.js';

const MAX_FILE_BYTES = 209_715_200;

interface StoreLookup {
  id: string;
  org_id: string;
}

function isStoreLookup(v: unknown): v is StoreLookup {
  if (typeof v !== 'object' || v === null) return false;
  const id: unknown = Reflect.get(v, 'id');
  const orgId: unknown = Reflect.get(v, 'org_id');
  return typeof id === 'string' && typeof orgId === 'string';
}

interface UploadInput {
  storeId: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

function parseUploadInput(req: Request): UploadInput | undefined {
  const storeId = getStoreIdParam(req);
  const tenantId = parseString(req.body, 'tenantId');
  const filename = parseString(req.body, 'filename');
  const mimeType = parseString(req.body, 'mimeType');
  const sizeBytes = parseNumber(req.body, 'sizeBytes');
  if (
    storeId === undefined ||
    tenantId === undefined ||
    filename === undefined ||
    mimeType === undefined ||
    sizeBytes === undefined
  ) {
    return undefined;
  }
  return { storeId, tenantId, filename, mimeType, sizeBytes };
}

async function lookupStore(supabase: SupabaseClient, storeId: string): Promise<StoreLookup | undefined> {
  const { data, error } = await supabase
    .from('rag_stores')
    .select('id, org_id')
    .eq('id', storeId)
    .maybeSingle();
  if (error !== null || !isStoreLookup(data)) return undefined;
  return data;
}

function buildGcsObject(orgId: string, input: UploadInput, fileId: string): string {
  const safeName = input.filename.replace(/[^A-Za-z0-9._-]/gv, '_');
  return `uploads/${orgId}/${input.tenantId}/${input.storeId}/${fileId}/${safeName}`;
}

async function createUpload(
  supabase: SupabaseClient,
  input: UploadInput,
  orgId: string,
  res: AuthenticatedResponse
): Promise<void> {
  const fileId = randomUUID();
  const gcsObject = buildGcsObject(orgId, input, fileId);
  const uploadUrl = await createUploadSignedUrl(gcsObject, input.mimeType);
  const { result, error } = await createPendingFile(supabase, {
    ragStoreId: input.storeId,
    tenantId: input.tenantId,
    orgId,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    gcsObject,
  });
  if (error !== null || result === null) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'create failed' });
    return;
  }
  res.status(HTTP_OK).json({ fileId: result.id, uploadUrl, gcsObject });
}

export async function handleInitUpload(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const input = parseUploadInput(req);
  if (input === undefined) {
    res
      .status(HTTP_BAD_REQUEST)
      .json({ error: 'missing storeId, tenantId, filename, mimeType, or sizeBytes' });
    return;
  }
  if (input.sizeBytes > MAX_FILE_BYTES) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file exceeds 200 MB limit' });
    return;
  }
  try {
    const store = await lookupStore(supabase, input.storeId);
    if (store === undefined) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'store not found' });
      return;
    }
    await createUpload(supabase, input, store.org_id, res);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
