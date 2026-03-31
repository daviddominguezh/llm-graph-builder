import { fetchFromBackend } from './backendProxy';

type SlugTable = 'agents' | 'organizations';

interface SlugCheckResult {
  slug: string;
  available: boolean;
}

function isSlugCheckResult(value: unknown): value is SlugCheckResult {
  return typeof value === 'object' && value !== null && 'slug' in value && 'available' in value;
}

export async function checkSlugAvailability(
  name: string,
  table: SlugTable
): Promise<{ slug: string; available: boolean } | null> {
  try {
    const data = await fetchFromBackend('POST', '/slugs/check-availability', { name, table });
    if (!isSlugCheckResult(data)) return null;
    return data;
  } catch {
    return null;
  }
}
