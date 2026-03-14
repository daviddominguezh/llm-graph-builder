'use server';

import type { McpLibraryRow } from '@/app/lib/mcp-library';
import {
  getLibraryItemById as getLibraryItemByIdLib,
  incrementInstallations,
  publishToLibrary as publishToLibraryLib,
  unpublishFromLibrary as unpublishFromLibraryLib,
  updateLibraryImageUrl,
} from '@/app/lib/mcp-library';
import { uploadMcpImage } from '@/app/lib/mcp-library-storage';
import type { PublishInput } from '@/app/lib/mcp-library-types';
import { serverError, serverLog } from '@/app/lib/serverLogger';
import { createClient } from '@/app/lib/supabase/server';

async function handleImageUpload(
  libraryItemId: string,
  imageFormData: FormData
): Promise<{ image_url: string | null; error: string | null }> {
  const supabase = await createClient();
  const file = imageFormData.get('image');
  if (!(file instanceof File)) return { image_url: null, error: 'No image file provided' };
  const uploadRes = await uploadMcpImage(supabase, libraryItemId, file);
  if (uploadRes.error !== null || uploadRes.result === null)
    return { image_url: null, error: uploadRes.error };
  await updateLibraryImageUrl(supabase, libraryItemId, uploadRes.result);
  return { image_url: uploadRes.result, error: null };
}

export async function publishMcpAction(
  item: PublishInput,
  imageFormData?: FormData
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  serverLog('[publishMcpAction] org_id:', item.org_id, 'name:', item.name);
  const supabase = await createClient();
  const res = await publishToLibraryLib(supabase, item);
  if (res.error !== null) {
    serverError('[publishMcpAction] error:', res.error);
    return res;
  }
  if (imageFormData !== undefined && res.result !== null) {
    const imgRes = await handleImageUpload(res.result.id, imageFormData);
    if (imgRes.error !== null) serverError('[publishMcpAction] image upload error:', imgRes.error);
  }
  serverLog('[publishMcpAction] published:', res.result?.id);
  return res;
}

export async function unpublishMcpAction(libraryItemId: string): Promise<{ error: string | null }> {
  serverLog('[unpublishMcpAction] libraryItemId:', libraryItemId);
  const supabase = await createClient();
  const res = await unpublishFromLibraryLib(supabase, libraryItemId);
  if (res.error !== null) serverError('[unpublishMcpAction] error:', res.error);
  return res;
}

export async function installMcpAction(
  libraryItemId: string
): Promise<{ result: McpLibraryRow | null; error: string | null }> {
  serverLog('[installMcpAction] libraryItemId:', libraryItemId);
  const supabase = await createClient();
  const itemRes = await getLibraryItemByIdLib(supabase, libraryItemId);
  if (itemRes.error !== null) {
    serverError('[installMcpAction] fetch error:', itemRes.error);
    return itemRes;
  }
  const countRes = await incrementInstallations(supabase, libraryItemId);
  if (countRes.error !== null) serverError('[installMcpAction] increment error:', countRes.error);
  serverLog('[installMcpAction] installed:', libraryItemId);
  return itemRes;
}
