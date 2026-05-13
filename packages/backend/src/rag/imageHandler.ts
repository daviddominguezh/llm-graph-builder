import type { SupabaseClient } from '@supabase/supabase-js';

import { setImageEmbedding } from '../db/queries/ragChunksQueries.js';
import { type RagFileRow, updateStatus } from '../db/queries/ragFilesQueries.js';
import type { SourcedChunk } from './chunker.js';
import { gcsUriFor } from './gcs.js';
import { setImagePresenceTrue } from './imagePresenceCache.js';
import { embedImageFromGcs } from './multimodalEmbeddings.js';

const ZERO_TOKENS = 0;
const ZERO_PARAGRAPH = 0;
const ZERO_OFFSET = 0;
const FIRST_PAGE = 1;
const EMPTY = 0;

export function buildImageChunk(file: RagFileRow): SourcedChunk {
  const gcsUri = gcsUriFor(file.gcs_object);
  return {
    content: gcsUri,
    content_hash: gcsUri,
    token_count: ZERO_TOKENS,
    page_number: FIRST_PAGE,
    page_end: FIRST_PAGE,
    paragraph_idx: ZERO_PARAGRAPH,
    char_start: ZERO_OFFSET,
    char_end: gcsUri.length,
  };
}

export async function fetchInsertedImageChunkId(
  supabase: SupabaseClient,
  fileId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('rag_chunks')
    .select('id')
    .eq('rag_file_id', fileId)
    .limit(FIRST_PAGE);
  if (error !== null || !Array.isArray(data) || data.length === EMPTY) return null;
  const [first] = data as unknown[];
  if (typeof first !== 'object' || first === null) return null;
  const { id } = first as { id?: unknown };
  return typeof id === 'string' ? id : null;
}

interface ImagePipelineHelpers {
  fail: (file: RagFileRow, error: string) => Promise<void>;
  persistChunks: (file: RagFileRow, chunks: SourcedChunk[]) => Promise<boolean>;
  log: (msg: string) => void;
}

export async function handleImage(
  supabase: SupabaseClient,
  file: RagFileRow,
  helpers: ImagePipelineHelpers
): Promise<void> {
  helpers.log(`handleImage: file=${file.id} mime=${file.mime_type}`);
  const vector = await embedImageFromGcs(gcsUriFor(file.gcs_object));
  if (vector.length === EMPTY) {
    await helpers.fail(file, 'multimodal embed returned no vector');
    return;
  }
  const ok = await helpers.persistChunks(file, [buildImageChunk(file)]);
  if (!ok) return;
  const chunkId = await fetchInsertedImageChunkId(supabase, file.id);
  if (chunkId === null) {
    await helpers.fail(file, 'image chunk id not found after insert');
    return;
  }
  const { error } = await setImageEmbedding(supabase, chunkId, vector);
  if (error !== null) {
    await helpers.fail(file, `setImageEmbedding: ${error}`);
    return;
  }
  await setImagePresenceTrue(file.rag_store_id, file.tenant_id);
  await updateStatus(supabase, file.id, { status: 'done', page_count: FIRST_PAGE });
}
