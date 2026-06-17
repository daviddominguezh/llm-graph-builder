export interface KvEntry {
  key: string;
  value: string;
}

export function filterDefault<T extends KvEntry>(entries: T[], query: string): T[] {
  if (query === '') return entries;
  const needle = query.toLowerCase();
  return entries.filter(
    (e) => e.key.toLowerCase().includes(needle) || e.value.toLowerCase().includes(needle)
  );
}
