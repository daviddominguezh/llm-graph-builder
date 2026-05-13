import { parsePath } from './parsePath.js';

export function normalizePath(runtimePath: string): string | null {
  const p = parsePath(runtimePath);
  if (!p.ok) return null;
  return p.segments
    .map(({ fieldName, indices }) => `${fieldName}${indices.map(() => '[]').join('')}`)
    .join('.');
}
