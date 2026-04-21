'use server';

import { checkSlugAvailability as checkSlugLib } from '@/app/lib/slugs';

type SlugTable = 'agents' | 'organizations';

interface SlugCheckResponse {
  slug: string;
  available: boolean;
}

export async function checkSlugAvailabilityAction(
  name: string,
  table: SlugTable
): Promise<SlugCheckResponse | null> {
  return await checkSlugLib(name, table);
}
