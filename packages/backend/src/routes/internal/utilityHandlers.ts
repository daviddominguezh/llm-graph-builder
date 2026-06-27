// Utility endpoints exposed to the Supabase edge functions.
//
// Both endpoints are tiny shims over Node-only libs (Vertex AI embedding model
// and the Vertex semantic-ranker) that don't load cleanly in Deno. The Postgres
// work — KV/RAG queries — lives entirely in the edge function now. (Regex
// validation moved in-process to re2js, so its BE hop was dropped.)
import type { Request, Response } from 'express';
import { z } from 'zod';

import { embedQuery } from '../../rag/embeddings.js';
import { rerankRecords } from '../../rag/rerank.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;

const EMBED_TEXT_MAX = 8192;
const RERANK_TEXT_MAX = 100_000;
const RECORDS_MIN = 1;
const TOP_N_MIN = 1;
const STRING_MIN = 1;

const EmbedBodySchema = z.object({
  text: z.string().min(STRING_MIN).max(EMBED_TEXT_MAX),
});

const RerankBodySchema = z.object({
  query: z.string().min(STRING_MIN).max(EMBED_TEXT_MAX),
  records: z
    .array(z.object({ id: z.string().min(STRING_MIN), content: z.string().max(RERANK_TEXT_MAX) }))
    .min(RECORDS_MIN),
  topN: z.number().int().min(TOP_N_MIN),
});

interface ErrPayload {
  ok: false;
  error: string;
}

function rejectInvalid(res: Response, message: string): void {
  const payload: ErrPayload = { ok: false, error: message };
  res.status(HTTP_BAD_REQUEST).json(payload);
}

export async function handleEmbed(req: Request, res: Response): Promise<void> {
  const parsed = EmbedBodySchema.safeParse(req.body);
  if (!parsed.success) {
    rejectInvalid(res, parsed.error.message);
    return;
  }
  try {
    const vector = await embedQuery(parsed.data.text);
    res.status(HTTP_OK).json({ vector });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'embedding failed';
    res.status(HTTP_INTERNAL).json({ error: message });
  }
}

export async function handleRerank(req: Request, res: Response): Promise<void> {
  const parsed = RerankBodySchema.safeParse(req.body);
  if (!parsed.success) {
    rejectInvalid(res, parsed.error.message);
    return;
  }
  try {
    const records = await rerankRecords({
      query: parsed.data.query,
      records: parsed.data.records,
      topN: parsed.data.topN,
    });
    res.status(HTTP_OK).json({ records });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'rerank failed';
    res.status(HTTP_INTERNAL).json({ error: message });
  }
}
