export interface KvEntry {
  key: string;
  value: string;
}

export function filterDefault(entries: KvEntry[], query: string): KvEntry[] {
  if (query === '') return entries;
  const needle = query.toLowerCase();
  return entries.filter(
    (e) => e.key.toLowerCase().includes(needle) || e.value.toLowerCase().includes(needle)
  );
}
