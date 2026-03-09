import type { SupabaseClient } from '@supabase/supabase-js';

type SlugTable = 'agents' | 'organizations';

const MAX_SLUG_ATTEMPTS = 100;
const FIRST_SUFFIX = 1;
const EMPTY_LENGTH = 0;

function isAlphanumeric(char: string): boolean {
  const code = char.charCodeAt(EMPTY_LENGTH);
  const aCode = 97;
  const zCode = 122;
  const zeroCode = 48;
  const nineCode = 57;
  return (code >= aCode && code <= zCode) || (code >= zeroCode && code <= nineCode);
}

function slugifyChars(input: string): string {
  return Array.from(input)
    .map((char) => (isAlphanumeric(char) ? char : '-'))
    .join('');
}

function collapseDashes(input: string): string {
  const parts = input.split('-').filter((part) => part.length > EMPTY_LENGTH);
  return parts.join('-');
}

export function generateSlug(name: string): string {
  return collapseDashes(slugifyChars(name.toLowerCase()));
}

async function isSlugTaken(supabase: SupabaseClient, slug: string, table: SlugTable): Promise<boolean> {
  const { data } = await supabase.from(table).select('slug').eq('slug', slug).limit(FIRST_SUFFIX);
  return data !== null && data.length > EMPTY_LENGTH;
}

function buildCandidate(baseSlug: string, suffix: number): string {
  return suffix === FIRST_SUFFIX ? baseSlug : `${baseSlug}-${String(suffix)}`;
}

async function trySlug(
  supabase: SupabaseClient,
  baseSlug: string,
  suffix: number,
  table: SlugTable
): Promise<string> {
  if (suffix > MAX_SLUG_ATTEMPTS) {
    return `${baseSlug}-${String(Date.now())}`;
  }

  const candidate = buildCandidate(baseSlug, suffix);
  const taken = await isSlugTaken(supabase, candidate, table);
  if (!taken) return candidate;

  return await trySlug(supabase, baseSlug, suffix + FIRST_SUFFIX, table);
}

export async function findUniqueSlug(
  supabase: SupabaseClient,
  baseSlug: string,
  table: SlugTable
): Promise<string> {
  return await trySlug(supabase, baseSlug, FIRST_SUFFIX, table);
}
