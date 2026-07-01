function decodeToken(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function tokens(pointer: string): string[] {
  if (pointer === '') return [];
  const parts = pointer.split('/');
  parts.shift();
  return parts.map(decodeToken);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nextContainer(existing: unknown): Record<string, unknown> {
  return isRecord(existing) ? { ...existing } : {};
}

export function setByJsonPointer(
  target: Record<string, unknown>,
  pointer: string,
  value: unknown
): Record<string, unknown> {
  const path = tokens(pointer);
  const root: Record<string, unknown> = { ...target };
  const lastKey = path.pop();
  if (lastKey === undefined) return root;
  let cursor = root;
  for (const key of path) {
    const next = nextContainer(cursor[key]);
    cursor[key] = next;
    cursor = next;
  }
  cursor[lastKey] = value;
  return root;
}
