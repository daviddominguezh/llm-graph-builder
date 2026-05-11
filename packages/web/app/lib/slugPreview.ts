const TENANT_SLUG_BASE_MAX_LENGTH = 37;
const A_CODE = 97;
const Z_CODE = 122;
const ZERO_CODE = 48;
const NINE_CODE = 57;
const FIRST_CHAR = 0;

function isAlphanumeric(char: string): boolean {
  const code = char.charCodeAt(FIRST_CHAR);
  return (code >= A_CODE && code <= Z_CODE) || (code >= ZERO_CODE && code <= NINE_CODE);
}

export function previewStoreSlug(name: string): string {
  const lower = name.toLowerCase();
  let out = '';
  for (const char of lower) {
    if (isAlphanumeric(char)) out += char;
    if (out.length >= TENANT_SLUG_BASE_MAX_LENGTH) break;
  }
  return out;
}
