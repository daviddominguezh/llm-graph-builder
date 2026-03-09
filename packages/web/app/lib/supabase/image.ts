const STORAGE_PUBLIC_PREFIX = '/storage/v1/object/public/';

/**
 * Convert a Supabase storage URL to a local proxy path.
 * e.g. "http://127.0.0.1:54321/storage/v1/object/public/org-avatars/id/avatar"
 *    → "/supabase-storage/org-avatars/id/avatar"
 *
 * This lets Next.js Image optimize the image without hitting
 * the private-IP restriction on the built-in optimizer.
 */
export function toProxyImageSrc(url: string): string {
  if (!url.includes(STORAGE_PUBLIC_PREFIX)) return url;
  const suffix = url.slice(url.indexOf(STORAGE_PUBLIC_PREFIX) + STORAGE_PUBLIC_PREFIX.length);
  return `/supabase-storage/${suffix}`;
}
