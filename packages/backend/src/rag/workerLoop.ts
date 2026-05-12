import type { SupabaseClient } from '@supabase/supabase-js';

import { insertChunks, listChunkIdsWithoutEmbedding, setEmbedding } from '../db/queries/ragChunksQueries.js';
import {
  type RagFileRow,
  claimActiveFiles,
  getRagFileById,
  updateStatus,
} from '../db/queries/ragFilesQueries.js';
import { type SourcedChunk, maxPage } from './chunker.js';
import { type OcrMode, checkOperation, submitBatch } from './documentAi.js';
import { embedTexts } from './embeddings.js';
import { readBytesObject, writeBytesObject } from './gcs.js';
import { derivePdfObjectPath, imageBytesToPdfBytes, isImageMime } from './imagePdf.js';
import { splitLayoutChunks } from './layoutSplitter.js';
import { splitOcrChunks } from './markdownSplitter.js';
import {
  fetchAllShards,
  mergeLayoutPayload,
  mergeOcrPayload,
  safeDumpFinalChunks,
  safeDumpShardsToDisk,
} from './parsedOutput.js';

const EMBED_CHUNK_PAGE_SIZE = 100;
const PDF_MIME = 'application/pdf';
const GS_BUCKET_PREFIX_REGEX = /^gs:\/\/[^\/]+\//v;
const EMPTY_LENGTH = 0;

function log(msg: string): void {
  process.stdout.write(`[ragWorker] ${msg}\n`);
}

async function fail(supabase: SupabaseClient, file: RagFileRow, error: string): Promise<void> {
  log(`file ${file.id} failed: ${error}`);
  await updateStatus(supabase, file.id, { status: 'failed', status_error: error });
}

async function handleParsing(supabase: SupabaseClient, file: RagFileRow): Promise<void> {
  const { da_operation: opName } = file;
  if (opName === null) {
    await fail(supabase, file, 'parsing without da_operation');
    return;
  }
  const state = await checkOperation(opName);
  if (state.status === 'running') return;
  if (state.status === 'failed') {
    await fail(supabase, file, `document ai: ${state.error ?? 'unknown'}`);
    return;
  }
  log(`handleParsing: file=${file.id} done`);
  await updateStatus(supabase, file.id, { status: 'chunking' });
}

async function persistChunks(
  supabase: SupabaseClient,
  file: RagFileRow,
  chunks: SourcedChunk[]
): Promise<boolean> {
  const { error } = await insertChunks(supabase, {
    ragFileId: file.id,
    ragStoreId: file.rag_store_id,
    tenantId: file.tenant_id,
    orgId: file.org_id,
    chunks,
  });
  if (error !== null) {
    await fail(supabase, file, `insertChunks: ${error}`);
    return false;
  }
  return true;
}

function resolveOcrMode(value: string | null): OcrMode {
  return value === 'advanced' ? 'advanced' : 'standard';
}

async function chunksFromShards(
  mode: OcrMode,
  shards: ReturnType<typeof fetchAllShards> extends Promise<infer T> ? T : never
): Promise<SourcedChunk[]> {
  if (mode === 'standard') {
    const payload = mergeOcrPayload(shards);
    return await splitOcrChunks(payload);
  }
  const payload = mergeLayoutPayload(shards);
  return await splitLayoutChunks(payload);
}

async function handleChunking(supabase: SupabaseClient, file: RagFileRow): Promise<void> {
  const prefix = file.parsed_uri ?? '';
  if (prefix === '') {
    await fail(supabase, file, 'chunking without parsed_uri');
    return;
  }
  const mode = resolveOcrMode(file.ocr_mode);
  const shards = await fetchAllShards(prefix);
  await safeDumpShardsToDisk(file.id, shards, log);
  const chunks = await chunksFromShards(mode, shards);
  log(
    `handleChunking: file=${file.id} mode=${mode} shards=${String(shards.length)} chunks=${String(chunks.length)}`
  );
  await safeDumpFinalChunks(file.id, chunks, log);
  if (chunks.length === EMPTY_LENGTH) {
    await fail(supabase, file, 'no chunks produced by Document AI');
    return;
  }
  const ok = await persistChunks(supabase, file, chunks);
  if (!ok) return;
  await updateStatus(supabase, file.id, { status: 'embedding', page_count: maxPage(chunks) });
}

interface IdVector {
  id: string;
  vector: number[];
}

function zipIdsAndVectors(ids: string[], vectors: number[][]): IdVector[] {
  const out: IdVector[] = [];
  ids.forEach((id, idx) => {
    const { [idx]: vector } = vectors;
    if (vector === undefined) return;
    out.push({ id, vector });
  });
  return out;
}

async function writeEmbeddingsForIds(
  supabase: SupabaseClient,
  file: RagFileRow,
  ids: string[],
  vectors: number[][]
): Promise<boolean> {
  const pairs = zipIdsAndVectors(ids, vectors);
  const finalError = await pairs.reduce<Promise<string | null>>(async (prev, pair) => {
    const existing = await prev;
    if (existing !== null) return existing;
    const { error: setErr } = await setEmbedding(supabase, pair.id, pair.vector);
    return setErr;
  }, Promise.resolve(null));
  if (finalError !== null) {
    await fail(supabase, file, `setEmbedding: ${finalError}`);
    return false;
  }
  return true;
}

async function handleEmbedding(supabase: SupabaseClient, file: RagFileRow): Promise<void> {
  const { ids, texts, error } = await listChunkIdsWithoutEmbedding(supabase, file.id, EMBED_CHUNK_PAGE_SIZE);
  if (error !== null) {
    await fail(supabase, file, `listChunks: ${error}`);
    return;
  }
  if (ids.length === EMPTY_LENGTH) {
    log(`handleEmbedding: file=${file.id} all done`);
    await updateStatus(supabase, file.id, { status: 'done' });
    return;
  }
  try {
    const { vectors } = await embedTexts({ texts });
    log(`handleEmbedding: file=${file.id} batch=${String(vectors.length)}`);
    await writeEmbeddingsForIds(supabase, file, ids, vectors);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await fail(supabase, file, `embedTexts: ${msg}`);
  }
}

async function dispatch(supabase: SupabaseClient, file: RagFileRow): Promise<void> {
  if (file.status === 'parsing') {
    await handleParsing(supabase, file);
    return;
  }
  if (file.status === 'chunking') {
    await handleChunking(supabase, file);
    return;
  }
  if (file.status === 'embedding') {
    await handleEmbedding(supabase, file);
  }
}

async function safeDispatch(supabase: SupabaseClient, file: RagFileRow): Promise<void> {
  try {
    await dispatch(supabase, file);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await fail(supabase, file, msg);
  }
}

export async function tickOnce(supabase: SupabaseClient): Promise<void> {
  const { result, error } = await claimActiveFiles(supabase);
  if (error !== null) {
    log(`claim error: ${error}`);
    return;
  }
  await result.reduce<Promise<void>>(async (prev, file) => {
    await prev;
    await safeDispatch(supabase, file);
  }, Promise.resolve());
}

async function prepareDocumentAiInput(
  gcsObject: string,
  mimeType: string
): Promise<{ inputObjectPath: string; mimeType: string }> {
  if (!isImageMime(mimeType)) {
    return { inputObjectPath: gcsObject, mimeType };
  }
  const imageBytes = await readBytesObject(gcsObject);
  const pdfBytes = await imageBytesToPdfBytes(imageBytes, mimeType);
  const pdfPath = derivePdfObjectPath(gcsObject);
  await writeBytesObject(pdfPath, pdfBytes, PDF_MIME);
  return { inputObjectPath: pdfPath, mimeType: PDF_MIME };
}

async function submitAndRecord(supabase: SupabaseClient, file: RagFileRow): Promise<void> {
  const outputPrefix = `parsed/${file.id}/`;
  const mode = resolveOcrMode(file.ocr_mode);
  const languageHints = mode === 'standard' ? file.language_hints : null;
  log(
    `submitAndRecord: file=${file.id} mode=${mode} mime=${file.mime_type} hints=${JSON.stringify(languageHints ?? [])}`
  );
  const prepared = await prepareDocumentAiInput(file.gcs_object, file.mime_type);
  const { operationName, outputGcsUri } = await submitBatch({
    inputObjectPath: prepared.inputObjectPath,
    outputPrefix,
    mimeType: prepared.mimeType,
    mode,
    languageHints,
  });
  log(`submitAndRecord: file=${file.id} op=${operationName} output=${outputGcsUri}`);
  await updateStatus(supabase, file.id, {
    status: 'parsing',
    da_operation: operationName,
    parsed_uri: outputGcsUri.replace(GS_BUCKET_PREFIX_REGEX, ''),
  });
}

export async function startParsing(supabase: SupabaseClient, fileId: string): Promise<void> {
  const { result, error } = await getRagFileById(supabase, fileId);
  if (error !== null || result === null) {
    log(`startParsing: file ${fileId} not found`);
    return;
  }
  try {
    await submitAndRecord(supabase, result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateStatus(supabase, fileId, { status: 'failed', status_error: msg });
  }
}
