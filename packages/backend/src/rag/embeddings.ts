import { setTimeout as sleepMs } from 'node:timers/promises';

import { google } from '@ai-sdk/google';
import { embedMany } from 'ai';

import { requireRagConfig } from './config.js';

const BATCH_SIZE = 20;
const MS_PER_MINUTE = 60_000;
const MIN_INTERVAL_MS_FLOOR = 200;
const EMBEDDING_MODEL_ID = 'text-embedding-004';
const ZERO = 0;

let rateLimitChain: Promise<void> = Promise.resolve();
let nextAllowedAt = ZERO;

async function applyRateLimit(): Promise<void> {
  const cfg = requireRagConfig();
  const minIntervalMs = Math.max(MS_PER_MINUTE / cfg.embeddingsRpm, MIN_INTERVAL_MS_FLOOR);
  const now = Date.now();
  const fireAt = Math.max(now, nextAllowedAt);
  nextAllowedAt = fireAt + minIntervalMs;
  const wait = fireAt - now;
  if (wait > ZERO) await sleepMs(wait);
}

async function rateLimit(): Promise<void> {
  const next = rateLimitChain.then(applyRateLimit);
  rateLimitChain = next.catch(() => undefined);
  await next;
}

export interface EmbedOptions {
  texts: string[];
  onBatchDone?: (completed: number, total: number) => void;
}

export interface EmbedResult {
  vectors: number[][];
}

function modelRef(): ReturnType<typeof google.textEmbeddingModel> {
  return google.textEmbeddingModel(EMBEDDING_MODEL_ID);
}

function makeBatches(texts: string[]): string[][] {
  const out: string[][] = [];
  for (let i = ZERO; i < texts.length; i += BATCH_SIZE) {
    out.push(texts.slice(i, i + BATCH_SIZE));
  }
  return out;
}

function asNumberArray(v: readonly unknown[] | undefined): number[] {
  if (v === undefined) return [];
  return v.filter((n): n is number => typeof n === 'number');
}

async function embedBatch(batch: string[]): Promise<number[][]> {
  await rateLimit();
  const { embeddings } = await embedMany({ model: modelRef(), values: batch });
  return embeddings.map((e) => asNumberArray(e));
}

async function appendBatch(
  acc: number[][],
  batch: string[],
  total: number,
  onBatchDone: EmbedOptions['onBatchDone']
): Promise<number[][]> {
  const vectors = await embedBatch(batch);
  const next = acc.concat(vectors);
  if (onBatchDone !== undefined) onBatchDone(next.length, total);
  return next;
}

export async function embedTexts({ texts, onBatchDone }: EmbedOptions): Promise<EmbedResult> {
  if (texts.length === ZERO) return { vectors: [] };
  const batches = makeBatches(texts);
  const vectors = await batches.reduce<Promise<number[][]>>(
    async (prev, batch) => await appendBatch(await prev, batch, texts.length, onBatchDone),
    Promise.resolve([])
  );
  return { vectors };
}

export async function embedQuery(text: string): Promise<number[]> {
  await rateLimit();
  const { embeddings } = await embedMany({ model: modelRef(), values: [text] });
  return asNumberArray(embeddings[ZERO]);
}
