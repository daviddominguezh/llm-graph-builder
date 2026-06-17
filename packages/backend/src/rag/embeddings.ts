import { vertex } from '@ai-sdk/google-vertex';
import { embedMany } from 'ai';
import { setTimeout as sleepMs } from 'node:timers/promises';

import { requireRagConfig } from './config.js';

const BATCH_SIZE = 20;
const MS_PER_MINUTE = 60_000;
const MIN_INTERVAL_MS_FLOOR = 200;
const EMBEDDING_MODEL_ID = 'text-embedding-004';
const ZERO = 0;
const FIRST = 0;

function log(msg: string): void {
  process.stdout.write(`[ragEmb] ${msg}\n`);
}

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

function modelRef(): ReturnType<typeof vertex.embeddingModel> {
  return vertex.embeddingModel(EMBEDDING_MODEL_ID);
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
  log(`embedBatch: provider=vertex model=${EMBEDDING_MODEL_ID} size=${String(batch.length)}`);
  const { embeddings } = await embedMany({ model: modelRef(), values: batch });
  const vectors = embeddings.map((e) => asNumberArray(e));
  log(`embedBatch: done count=${String(vectors.length)} dim=${String(vectors[FIRST]?.length ?? ZERO)}`);
  return vectors;
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
  log(`embedQuery: provider=vertex model=${EMBEDDING_MODEL_ID} chars=${String(text.length)}`);
  const { embeddings } = await embedMany({ model: modelRef(), values: [text] });
  const vector = asNumberArray(embeddings[ZERO]);
  log(`embedQuery: done dim=${String(vector.length)}`);
  return vector;
}
