import type { SupabaseClient } from '@supabase/supabase-js';

type SlugTable = 'agents' | 'organizations';

const FIRST_SUFFIX = 1;
const BASE_SUFFIX = 0;
const EMPTY_LENGTH = 0;

interface SlugRow {
  slug: string;
}

function isSlugRow(value: unknown): value is SlugRow {
  return typeof value === 'object' && value !== null && 'slug' in value;
}

function extractSuffix(slug: string, baseSlug: string): number {
  if (slug === baseSlug) return BASE_SUFFIX;
  const tail = slug.slice(baseSlug.length + FIRST_SUFFIX);
  const num = Number(tail);
  return Number.isFinite(num) && num > BASE_SUFFIX ? num : BASE_SUFFIX;
}

function findNextSuffix(rows: SlugRow[], baseSlug: string): number {
  let maxSuffix = 0;
  for (const row of rows) {
    const suffix = extractSuffix(row.slug, baseSlug);
    if (suffix > maxSuffix) maxSuffix = suffix;
  }
  return maxSuffix + FIRST_SUFFIX;
}

export async function findUniqueSlug(
  supabase: SupabaseClient,
  baseSlug: string,
  table: SlugTable
): Promise<string> {
  const { data } = await supabase
    .from(table)
    .select('slug')
    .or(`slug.eq.${baseSlug},slug.like.${baseSlug}-%`);

  const rows: SlugRow[] = (data ?? []).filter(isSlugRow);
  const exactExists = rows.some((r) => r.slug === baseSlug);
  if (!exactExists) return baseSlug;

  const next = findNextSuffix(rows, baseSlug);
  return `${baseSlug}-${String(next)}`;
}

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

// The DB CHECK allows up to 40 characters; we stop at 37 so the suffix
// logic in findUniqueTenantSlug (up to 3 numeric digits) always fits.
const TENANT_SLUG_BASE_MAX_LENGTH = 37;

export function generateTenantSlug(name: string): string {
  const lower = name.toLowerCase();
  let out = '';
  for (const char of lower) {
    if (isAlphanumeric(char)) out += char;
    if (out.length >= TENANT_SLUG_BASE_MAX_LENGTH) break;
  }
  return out;
}
