import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'tenant-avatars';
const AVATAR_FILENAME = 'avatar';

function buildPath(tenantId: string): string {
  return `${tenantId}/${AVATAR_FILENAME}`;
}

export async function uploadTenantAvatar(
  supabase: SupabaseClient,
  tenantId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ result: string | null; error: string | null }> {
  const path = buildPath(tenantId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, {
    upsert: true,
    contentType: mimeType,
  });

  if (error !== null) return { result: null, error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { result: data.publicUrl, error: null };
}

export async function removeTenantAvatar(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ error: string | null }> {
  const path = buildPath(tenantId);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error !== null) return { error: error.message };
  return { error: null };
}
