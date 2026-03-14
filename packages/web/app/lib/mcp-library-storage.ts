import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'mcp-images';

function buildPath(libraryItemId: string): string {
  return `${libraryItemId}/image`;
}

export async function uploadMcpImage(
  supabase: SupabaseClient,
  libraryItemId: string,
  file: File
): Promise<{ result: string | null; error: string | null }> {
  const path = buildPath(libraryItemId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });

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
