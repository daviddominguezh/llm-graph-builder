// Utility endpoints exposed to the Supabase edge functions.
//
// Both endpoints are tiny shims over Node-only libs (Vertex AI embedding model
// and the `re2` native addon) that don't load cleanly in Deno. The Postgres
// work — KV/RAG queries — lives entirely in the edge function now.
import type { Request, Response } from 'express';
import RE2 from 're2';
import { z } from 'zod';

import { embedQuery } from '../../rag/embeddings.js';

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL = 500;

const EMBED_TEXT_MAX = 8192;
const PATTERN_MAX = 1024;
const STRING_MIN = 1;

const EmbedBodySchema = z.object({
  text: z.string().min(STRING_MIN).max(EMBED_TEXT_MAX),
});

const RegexValidateBodySchema = z.object({
  pattern: z.string().min(STRING_MIN).max(PATTERN_MAX),
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

export function handleRegexValidate(req: Request, res: Response): void {
  const parsed = RegexValidateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    rejectInvalid(res, parsed.error.message);
    return;
  }
  try {
    const compiled = new RE2(parsed.data.pattern);
    // Reference compiled to avoid `no-new` while still exercising the compiler.
    void compiled.source;
    res.status(HTTP_OK).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid regex';
    res.status(HTTP_BAD_REQUEST).json({ ok: false, error: message });
  }
}
