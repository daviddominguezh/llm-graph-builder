import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'org-avatars';
const AVATAR_FILENAME = 'avatar';

function buildPath(orgId: string): string {
  return `${orgId}/${AVATAR_FILENAME}`;
}

export async function uploadOrgAvatar(
  supabase: SupabaseClient,
  orgId: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ result: string | null; error: string | null }> {
  const path = buildPath(orgId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, fileBuffer, {
    upsert: true,
    contentType: mimeType,
  });

  if (error !== null) return { result: null, error: error.message };

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { result: data.publicUrl, error: null };
}

export async function removeOrgAvatar(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ error: string | null }> {
  const path = buildPath(orgId);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error !== null) return { error: error.message };
  return { error: null };
}
