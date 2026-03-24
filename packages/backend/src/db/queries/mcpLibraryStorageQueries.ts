import type { SupabaseClient } from './operationHelpers.js';

const BUCKET = 'mcp-images';
const IMAGE_FILENAME = 'image';

function buildPath(libraryItemId: string): string {
  return `${libraryItemId}/${IMAGE_FILENAME}`;
}

export async function uploadMcpImage(
  supabase: SupabaseClient,
  libraryItemId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ result: string | null; error: string | null }> {
  const path = buildPath(libraryItemId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, {
    upsert: true,
    contentType: mimeType,
  });

  if (error !== null) return { result: null, error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { result: data.publicUrl, error: null };
}

export async function removeMcpImage(
  supabase: SupabaseClient,
  libraryItemId: string
): Promise<{ error: string | null }> {
  const path = buildPath(libraryItemId);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error !== null) return { error: error.message };
  return { error: null };
}
