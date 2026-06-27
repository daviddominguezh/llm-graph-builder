import type { InternalApiClient } from '../internalApiClient.js';
import type { RagChunk } from './ragQueries.js';

const EMPTY = 0;

// Always-on rerank of a bounded candidate pool. One rerank call per search; if
// the rerank hop returns nothing (e.g. empty pool), keep the retrieval order.
export async function rerankPool(
  client: InternalApiClient,
  query: string,
  pool: RagChunk[]
): Promise<RagChunk[]> {
  if (pool.length === EMPTY) return pool;
  const ranked = await client.rerank({
    query,
    records: pool.map((c) => ({ id: c.id, content: c.content })),
    topN: pool.length,
  });
  if (ranked.length === EMPTY) return pool;
  const byId = new Map(pool.map((c) => [c.id, c]));
  const out: RagChunk[] = [];
  for (const r of ranked) {
    const c = byId.get(r.id);
    if (c !== undefined) out.push(c);
  }
  return out;
}
