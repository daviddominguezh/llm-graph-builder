# RAG Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full RAG pipeline for `rag_stores`: signed-URL GCS uploads → Document AI Layout Parser batch → tenant-isolated chunks with audit metadata → Gemini embeddings → pgvector storage → name/content/semantic search → SSE progress UI → delete cleanup.

**Architecture:** Browser uploads files directly to a Google Cloud Storage bucket via signed URLs. A single `ragWorker` process polls a `rag_files.status` state machine (`parsing → chunking → embedding → done`) and drives each file through Document AI batch parsing, chunk persistence, and Gemini batch embedding. The browser subscribes to per-file status via SSE proxied through a Next.js route handler. Tenant isolation is enforced by denormalized `tenant_id` on every chunk plus RLS.

**Tech Stack:** Express + Supabase Postgres + pgvector (HNSW cosine), `@google-cloud/storage`, `@google-cloud/documentai`, `ai` v6 + `@ai-sdk/google` (Gemini `text-embedding-004`), Next.js 16 App Router, server actions, `EventSource` for SSE.

**Reference spec:** `docs/superpowers/specs/2026-05-11-rag-pipeline-design.md`

---

## File map

**Created (backend):**
- `supabase/migrations/20260511130000_rag_pipeline.sql`
- `packages/backend/src/rag/config.ts`
- `packages/backend/src/rag/gcs.ts`
- `packages/backend/src/rag/documentAi.ts`
- `packages/backend/src/rag/chunker.ts`
- `packages/backend/src/rag/chunker.test.ts`
- `packages/backend/src/rag/embeddings.ts`
- `packages/backend/src/rag/workerLoop.ts`
- `packages/backend/src/workers/ragWorker.ts`
- `packages/backend/src/db/queries/ragFilesQueries.ts`
- `packages/backend/src/db/queries/ragChunksQueries.ts`
- `packages/backend/src/db/queries/ragUsageQueries.ts`
- `packages/backend/src/routes/ragStores/ragFiles/ragFilesRouter.ts`
- `packages/backend/src/routes/ragStores/ragFiles/ragFileHelpers.ts`
- `packages/backend/src/routes/ragStores/ragFiles/initUpload.ts`
- `packages/backend/src/routes/ragStores/ragFiles/confirmUpload.ts`
- `packages/backend/src/routes/ragStores/ragFiles/listFiles.ts`
- `packages/backend/src/routes/ragStores/ragFiles/getFile.ts`
- `packages/backend/src/routes/ragStores/ragFiles/getChunks.ts`
- `packages/backend/src/routes/ragStores/ragFiles/deleteFile.ts`
- `packages/backend/src/routes/ragStores/ragFiles/streamStatus.ts`
- `packages/backend/src/routes/ragStores/ragFiles/searchChunks.ts`

**Created (web):**
- `packages/web/app/lib/ragFiles.ts`
- `packages/web/app/actions/ragFiles.ts`
- `packages/web/app/api/rag-files/[id]/stream/route.ts`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/useRagUpload.ts`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/FileUploadDropzone.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/FileStatusStream.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/FileRow.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/FileChunksDrawer.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagSearchBar.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/SearchResults.tsx`
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagTenantContent.tsx` (new file with the new component; replaces inline `RagTenantContent` inside `RagStorePageClient.tsx`)

**Modified:**
- `packages/backend/package.json` (deps)
- `packages/backend/src/server.ts` (mount sub-router; start worker)
- `packages/backend/src/lib/startupChecks.ts` (validate RAG env vars)
- `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagStorePageClient.tsx` (use the new `RagTenantContent`)
- `packages/web/messages/en.json` (new i18n keys)
- `packages/web/components/ui/` — none expected; reuse existing `Dialog`, `Button`, `Input`, `Table`, `AlertDialog`

---

# Phase 1 — Backend foundation

## Task 1: Migration — pgvector extension + rag_files + rag_chunks + views + RLS

**Files:**
- Create: `supabase/migrations/20260511130000_rag_pipeline.sql`

- [ ] **Step 1:** Create the migration file with this exact content:

```sql
-- RAG pipeline: per-tenant file uploads, parsed chunks, embeddings.
-- Requires the vector extension. Tenant isolation enforced by denormalized
-- tenant_id + org_id on every row plus RLS via is_org_member.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.rag_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_store_id  uuid NOT NULL REFERENCES public.rag_stores(id)    ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id)       ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    bigint NOT NULL,
  page_count    integer,
  status        text NOT NULL DEFAULT 'pending',
  status_error  text,
  gcs_object    text NOT NULL,
  da_operation  text,
  parsed_uri    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rag_files_status_valid
    CHECK (status IN ('pending','uploading','parsing','chunking','embedding','done','failed'))
);
CREATE INDEX idx_rag_files_store_tenant ON public.rag_files(rag_store_id, tenant_id);
CREATE INDEX idx_rag_files_status_pending
  ON public.rag_files(status)
  WHERE status NOT IN ('done','failed');

CREATE TABLE public.rag_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_file_id     uuid NOT NULL REFERENCES public.rag_files(id)   ON DELETE CASCADE,
  rag_store_id    uuid NOT NULL REFERENCES public.rag_stores(id)  ON DELETE CASCADE,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id)     ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  page_number     integer,
  paragraph_idx   integer,
  char_start      integer,
  char_end        integer,
  content         text NOT NULL,
  content_hash    text NOT NULL,
  token_count     integer,
  embedding       vector(768),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rag_chunks_file              ON public.rag_chunks(rag_file_id);
CREATE INDEX idx_rag_chunks_store_tenant      ON public.rag_chunks(rag_store_id, tenant_id);
CREATE INDEX idx_rag_chunks_embedding_cosine
  ON public.rag_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_rag_chunks_content_fts
  ON public.rag_chunks USING gin (to_tsvector('simple', content));

-- SECURITY DEFINER helper: resolve a rag_file's org_id without hitting RLS.
CREATE OR REPLACE FUNCTION public.rag_file_org_id(p_rag_file_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT org_id FROM public.rag_files WHERE id = p_rag_file_id;
$$;

-- RLS
ALTER TABLE public.rag_files  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read rag_files"
  ON public.rag_files FOR SELECT USING (public.is_org_member(org_id));
CREATE POLICY "Org members can insert rag_files"
  ON public.rag_files FOR INSERT WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "Org members can update rag_files"
  ON public.rag_files FOR UPDATE USING (public.is_org_member(org_id));
CREATE POLICY "Org members can delete rag_files"
  ON public.rag_files FOR DELETE USING (public.is_org_member(org_id));

CREATE POLICY "Org members can read rag_chunks"
  ON public.rag_chunks FOR SELECT
  USING (public.is_org_member(public.rag_file_org_id(rag_file_id)));
CREATE POLICY "Org members can insert rag_chunks"
  ON public.rag_chunks FOR INSERT
  WITH CHECK (public.is_org_member(public.rag_file_org_id(rag_file_id)));
CREATE POLICY "Org members can update rag_chunks"
  ON public.rag_chunks FOR UPDATE
  USING (public.is_org_member(public.rag_file_org_id(rag_file_id)));
CREATE POLICY "Org members can delete rag_chunks"
  ON public.rag_chunks FOR DELETE
  USING (public.is_org_member(public.rag_file_org_id(rag_file_id)));

-- Aggregate views (RLS inherits from underlying tables).
CREATE VIEW public.rag_usage_by_tenant AS
SELECT org_id, tenant_id, rag_store_id,
       count(*) FILTER (WHERE status = 'done')                          AS files_count,
       coalesce(sum(page_count) FILTER (WHERE status = 'done'), 0)::bigint AS pages_count,
       coalesce(sum(size_bytes), 0)::bigint                              AS bytes_total
FROM public.rag_files
GROUP BY org_id, tenant_id, rag_store_id;

CREATE VIEW public.rag_usage_by_org AS
SELECT org_id,
       count(*) FILTER (WHERE status = 'done')                          AS files_count,
       coalesce(sum(page_count) FILTER (WHERE status = 'done'), 0)::bigint AS pages_count,
       coalesce(sum(size_bytes), 0)::bigint                              AS bytes_total
FROM public.rag_files
GROUP BY org_id;
```

- [ ] **Step 2:** Commit. Do NOT apply the migration; user applies manually.

```bash
git add supabase/migrations/20260511130000_rag_pipeline.sql
git commit -m "feat(db): rag_files, rag_chunks, pgvector + views + RLS"
```

---

## Task 2: Backend dependencies

**Files:**
- Modify: `packages/backend/package.json`

- [ ] **Step 1:** Add four runtime dependencies (Node ESM; pinned majors). Use:

```bash
npm install -w packages/backend @google-cloud/storage@^7.0.0 @google-cloud/documentai@^9.0.0 ai@^6.0.116 @ai-sdk/google@^2.0.0
```

If the npm command fails to resolve `@ai-sdk/google@^2.0.0`, fall back to the latest 1.x with `@ai-sdk/google@^1.0.0` — both expose `google.textEmbeddingModel(name)`.

- [ ] **Step 2:** Verify imports resolve:

```bash
node -e "import('@google-cloud/storage').then(()=>console.log('storage ok')); import('@google-cloud/documentai').then(()=>console.log('documentai ok')); import('ai').then(()=>console.log('ai ok')); import('@ai-sdk/google').then(()=>console.log('google ok'));"
```
Expected: four `ok` lines.

- [ ] **Step 3:** Commit:

```bash
git add packages/backend/package.json packages/backend/package-lock.json package-lock.json
git commit -m "feat(backend): add GCP storage, document AI, ai sdk deps"
```

---

## Task 3: RAG config module + startup validation

**Files:**
- Create: `packages/backend/src/rag/config.ts`
- Modify: `packages/backend/src/lib/startupChecks.ts`

- [ ] **Step 1:** Create `packages/backend/src/rag/config.ts`:

```ts
const DEFAULT_EMBEDDINGS_RPM = 60;

export interface RagConfig {
  projectId: string;
  location: string;
  processorId: string;
  bucket: string;
  credentialsPath: string | undefined;
  embeddingsRpm: number;
}

interface OptionalRagConfig {
  config: RagConfig | null;
  missing: string[];
}

function pickEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string' || value === '') return undefined;
  return value;
}

export function readRagConfig(): OptionalRagConfig {
  const projectId = pickEnv('GCP_PROJECT_ID');
  const location = pickEnv('GCP_LOCATION') ?? 'us';
  const processorId = pickEnv('DOCUMENTAI_PROCESSOR_ID');
  const bucket = pickEnv('GCS_BUCKET');
  const credentialsPath = pickEnv('GOOGLE_APPLICATION_CREDENTIALS');
  const rpm = Number(pickEnv('EMBEDDINGS_RPM') ?? String(DEFAULT_EMBEDDINGS_RPM));

  const missing: string[] = [];
  if (projectId === undefined) missing.push('GCP_PROJECT_ID');
  if (processorId === undefined) missing.push('DOCUMENTAI_PROCESSOR_ID');
  if (bucket === undefined) missing.push('GCS_BUCKET');

  if (projectId === undefined || processorId === undefined || bucket === undefined) {
    return { config: null, missing };
  }
  return {
    config: { projectId, location, processorId, bucket, credentialsPath, embeddingsRpm: rpm },
    missing,
  };
}

export function requireRagConfig(): RagConfig {
  const { config, missing } = readRagConfig();
  if (config === null) {
    throw new Error(`RAG config missing env vars: ${missing.join(', ')}`);
  }
  return config;
}
```

- [ ] **Step 2:** Read `packages/backend/src/lib/startupChecks.ts` first to learn its pattern. Then append a check that logs a warning if RAG config is incomplete (do NOT throw — keep dev environments without GCP running):

```ts
// Append near other check functions:
import { readRagConfig } from '../rag/config.js';

export function checkRagConfig(): void {
  const { config, missing } = readRagConfig();
  if (config === null) {
    process.stdout.write(
      `[startup] RAG pipeline disabled — missing env: ${missing.join(', ')}\n`
    );
    return;
  }
  process.stdout.write('[startup] RAG pipeline config ok\n');
}
```

Then wire `checkRagConfig()` into wherever the existing checks are invoked (look for a function like `runStartupChecks` or similar — call `checkRagConfig()` from there). If the existing file already exports an array of checks, append `checkRagConfig` to it.

- [ ] **Step 3:** Typecheck:

```bash
npm run typecheck -w packages/backend
```
Expected: pass.

- [ ] **Step 4:** Commit:

```bash
git add packages/backend/src/rag/config.ts packages/backend/src/lib/startupChecks.ts
git commit -m "feat(backend): rag config module + startup validation"
```

---

# Phase 2 — Backend lib

## Task 4: GCS wrapper

**Files:**
- Create: `packages/backend/src/rag/gcs.ts`

- [ ] **Step 1:** Create the file:

```ts
import { Storage } from '@google-cloud/storage';

import { type RagConfig, requireRagConfig } from './config.js';

const SIGNED_URL_EXPIRES_MS = 15 * 60 * 1000;

let cachedStorage: Storage | null = null;
function getStorage(): Storage {
  if (cachedStorage === null) cachedStorage = new Storage();
  return cachedStorage;
}

function bucketName(): string {
  const cfg: RagConfig = requireRagConfig();
  return cfg.bucket;
}

export function gcsUriFor(objectPath: string): string {
  return `gs://${bucketName()}/${objectPath}`;
}

export async function createUploadSignedUrl(
  objectPath: string,
  contentType: string
): Promise<string> {
  const file = getStorage().bucket(bucketName()).file(objectPath);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + SIGNED_URL_EXPIRES_MS,
    contentType,
  });
  return url;
}

export async function listObjectsUnder(prefix: string): Promise<string[]> {
  const [files] = await getStorage().bucket(bucketName()).getFiles({ prefix });
  return files.map((f) => f.name);
}

export async function readJsonObject<T>(objectPath: string): Promise<T> {
  const [buffer] = await getStorage().bucket(bucketName()).file(objectPath).download();
  return JSON.parse(buffer.toString('utf8')) as T;
}

export async function deleteObject(objectPath: string): Promise<void> {
  try {
    await getStorage().bucket(bucketName()).file(objectPath).delete();
  } catch (err) {
    process.stdout.write(`[gcs] delete failed for ${objectPath}: ${String(err)}\n`);
  }
}

export async function deletePrefix(prefix: string): Promise<void> {
  try {
    await getStorage().bucket(bucketName()).deleteFiles({ prefix });
  } catch (err) {
    process.stdout.write(`[gcs] deletePrefix failed for ${prefix}: ${String(err)}\n`);
  }
}
```

- [ ] **Step 2:** Typecheck:

```bash
npm run typecheck -w packages/backend
```
Expected: pass.

- [ ] **Step 3:** Commit:

```bash
git add packages/backend/src/rag/gcs.ts
git commit -m "feat(backend): GCS wrapper (signed URL, list, read, delete)"
```

---

## Task 5: Document AI wrapper

**Files:**
- Create: `packages/backend/src/rag/documentAi.ts`

- [ ] **Step 1:** Create the file:

```ts
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

import { type RagConfig, requireRagConfig } from './config.js';
import { gcsUriFor } from './gcs.js';

const CHUNK_SIZE_DEFAULT = 500;

let cachedClient: DocumentProcessorServiceClient | null = null;
function getClient(): DocumentProcessorServiceClient {
  if (cachedClient === null) cachedClient = new DocumentProcessorServiceClient();
  return cachedClient;
}

function processorName(cfg: RagConfig): string {
  return `projects/${cfg.projectId}/locations/${cfg.location}/processors/${cfg.processorId}`;
}

export interface BatchSubmitInput {
  inputObjectPath: string;
  outputPrefix: string;
  mimeType: string;
}

export interface BatchSubmitResult {
  operationName: string;
  outputGcsUri: string;
}

export async function submitBatch(input: BatchSubmitInput): Promise<BatchSubmitResult> {
  const cfg = requireRagConfig();
  const outputGcsUri = gcsUriFor(input.outputPrefix);
  const [operation] = await getClient().batchProcessDocuments({
    name: processorName(cfg),
    inputDocuments: {
      gcsDocuments: {
        documents: [{ gcsUri: gcsUriFor(input.inputObjectPath), mimeType: input.mimeType }],
      },
    },
    documentOutputConfig: {
      gcsOutputConfig: { gcsUri: outputGcsUri },
    },
    processOptions: {
      layoutConfig: {
        chunkingConfig: {
          chunkSize: CHUNK_SIZE_DEFAULT,
          includeAncestorHeadings: true,
        },
      },
    },
  });
  const operationName = operation.name ?? '';
  if (operationName === '') {
    throw new Error('Document AI batch did not return an operation name');
  }
  return { operationName, outputGcsUri };
}

export type OperationStatus = 'running' | 'done' | 'failed';
export interface OperationState {
  status: OperationStatus;
  error?: string;
}

export async function checkOperation(operationName: string): Promise<OperationState> {
  const [op] = await getClient().checkBatchProcessDocumentsProgress(operationName);
  if (op.done !== true) return { status: 'running' };
  if (op.error !== null && op.error !== undefined) {
    const message = typeof op.error.message === 'string' ? op.error.message : 'unknown error';
    return { status: 'failed', error: message };
  }
  return { status: 'done' };
}
```

Note: the Document AI client's `checkBatchProcessDocumentsProgress` returns an object whose `.done` and `.error` shapes are typed by the SDK. If TypeScript complains, narrow with `if (op.done === true)` and access `op.error?.message`.

- [ ] **Step 2:** Typecheck:

```bash
npm run typecheck -w packages/backend
```
Expected: pass.

- [ ] **Step 3:** Commit:

```bash
git add packages/backend/src/rag/documentAi.ts
git commit -m "feat(backend): Document AI batch wrapper"
```

---

## Task 6: Chunker (parses Document AI output → SourcedChunk[])

**Files:**
- Create: `packages/backend/src/rag/chunker.ts`
- Create: `packages/backend/src/rag/chunker.test.ts`

- [ ] **Step 1:** Write the failing test (`chunker.test.ts`):

```ts
import { describe, expect, it } from '@jest/globals';

import { type DocumentAiPayload, normalizeChunks } from './chunker.js';

const SAMPLE: DocumentAiPayload = {
  chunkedDocument: {
    chunks: [
      { chunkId: 'c1', content: 'Hello world', pageSpan: { pageStart: 1, pageEnd: 1 } },
      { chunkId: 'c2', content: '  ', pageSpan: { pageStart: 1, pageEnd: 1 } },
      { chunkId: 'c3', content: 'Second chunk text', pageSpan: { pageStart: 2, pageEnd: 2 } },
    ],
  },
};

describe('normalizeChunks', () => {
  it('skips empty / too-short chunks', () => {
    const out = normalizeChunks(SAMPLE, { minChars: 5 });
    expect(out).toHaveLength(2);
    expect(out[0]?.content).toBe('Hello world');
    expect(out[1]?.content).toBe('Second chunk text');
  });

  it('assigns paragraph_idx sequentially per page', () => {
    const out = normalizeChunks(SAMPLE, { minChars: 0 });
    expect(out[0]?.paragraph_idx).toBe(0);
    expect(out[1]?.paragraph_idx).toBe(1);
    expect(out[2]?.paragraph_idx).toBe(0);
  });

  it('computes char_start / char_end as a running offset', () => {
    const out = normalizeChunks(SAMPLE, { minChars: 0 });
    expect(out[0]?.char_start).toBe(0);
    expect(out[0]?.char_end).toBe('Hello world'.length);
    expect(out[1]?.char_start).toBe('Hello world'.length);
  });

  it('returns max page seen', () => {
    const out = normalizeChunks(SAMPLE, { minChars: 0 });
    const maxPage = Math.max(...out.map((c) => c.page_number));
    expect(maxPage).toBe(2);
  });
});
```

Run: `npm run test -w packages/backend -- --testPathPatterns=chunker` — expect FAIL (module not found).

- [ ] **Step 2:** Create `chunker.ts`:

```ts
import { createHash } from 'crypto';

const DEFAULT_MIN_CHARS = 30;
const CHARS_PER_TOKEN_ESTIMATE = 4;

export interface DocumentAiChunk {
  chunkId?: string;
  content?: string;
  pageSpan?: {
    pageStart?: number;
    pageEnd?: number;
  };
}

export interface DocumentAiPayload {
  chunkedDocument?: {
    chunks?: DocumentAiChunk[];
  };
}

export interface SourcedChunk {
  content: string;
  content_hash: string;
  token_count: number;
  page_number: number;
  paragraph_idx: number;
  char_start: number;
  char_end: number;
}

export interface NormalizeOptions {
  minChars: number;
}

function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function tokenEstimate(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE));
}

interface PageState {
  paragraph: number;
}

export function normalizeChunks(
  payload: DocumentAiPayload,
  options: NormalizeOptions = { minChars: DEFAULT_MIN_CHARS }
): SourcedChunk[] {
  const chunks = payload.chunkedDocument?.chunks ?? [];
  const out: SourcedChunk[] = [];
  const pageState = new Map<number, PageState>();
  let runningOffset = 0;

  for (const raw of chunks) {
    const content = (raw.content ?? '').trim();
    if (content.length < options.minChars) {
      runningOffset += (raw.content ?? '').length;
      continue;
    }
    const page = raw.pageSpan?.pageStart ?? 1;
    const state = pageState.get(page) ?? { paragraph: 0 };
    out.push({
      content,
      content_hash: hashContent(content),
      token_count: tokenEstimate(content),
      page_number: page,
      paragraph_idx: state.paragraph,
      char_start: runningOffset,
      char_end: runningOffset + content.length,
    });
    pageState.set(page, { paragraph: state.paragraph + 1 });
    runningOffset += content.length;
  }
  return out;
}

export function maxPage(chunks: SourcedChunk[]): number {
  let max = 0;
  for (const c of chunks) if (c.page_number > max) max = c.page_number;
  return max;
}
```

- [ ] **Step 3:** Run tests: `npm run test -w packages/backend -- --testPathPatterns=chunker` — expect PASS (4 tests).

- [ ] **Step 4:** Commit:

```bash
git add packages/backend/src/rag/chunker.ts packages/backend/src/rag/chunker.test.ts
git commit -m "feat(backend): Document AI output → SourcedChunk[] normalizer"
```

---

## Task 7: Embeddings wrapper (Gemini batched with rate limit)

**Files:**
- Create: `packages/backend/src/rag/embeddings.ts`

- [ ] **Step 1:** Create:

```ts
import { google } from '@ai-sdk/google';
import { embedMany } from 'ai';

import { requireRagConfig } from './config.js';

const BATCH_SIZE = 20;
const MS_PER_MINUTE = 60_000;
const MIN_INTERVAL_MS_FLOOR = 200;
const EMBEDDING_MODEL_ID = 'text-embedding-004';

let lastCallAt = 0;

async function rateLimit(): Promise<void> {
  const cfg = requireRagConfig();
  const minIntervalMs = Math.max(MS_PER_MINUTE / cfg.embeddingsRpm, MIN_INTERVAL_MS_FLOOR);
  const now = Date.now();
  const wait = lastCallAt + minIntervalMs - now;
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

export interface EmbedOptions {
  texts: string[];
  onBatchDone?: (completed: number, total: number) => void;
}

export interface EmbedResult {
  vectors: number[][];
}

function modelRef() {
  return google.textEmbeddingModel(EMBEDDING_MODEL_ID);
}

function makeBatches(texts: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(texts.slice(i, i + BATCH_SIZE));
  }
  return out;
}

export async function embedTexts({ texts, onBatchDone }: EmbedOptions): Promise<EmbedResult> {
  if (texts.length === 0) return { vectors: [] };
  const batches = makeBatches(texts);
  const result: number[][] = [];
  let completed = 0;
  for (const batch of batches) {
    await rateLimit();
    const { embeddings } = await embedMany({ model: modelRef(), values: batch });
    for (const e of embeddings) result.push(e as number[]);
    completed += batch.length;
    if (onBatchDone !== undefined) onBatchDone(completed, texts.length);
  }
  return { vectors: result };
}

export async function embedQuery(text: string): Promise<number[]> {
  await rateLimit();
  const { embeddings } = await embedMany({ model: modelRef(), values: [text] });
  return (embeddings[0] ?? []) as number[];
}
```

- [ ] **Step 2:** Typecheck:

```bash
npm run typecheck -w packages/backend
```
Expected: pass.

- [ ] **Step 3:** Commit:

```bash
git add packages/backend/src/rag/embeddings.ts
git commit -m "feat(backend): batched + rate-limited Gemini embeddings wrapper"
```

---

# Phase 3 — Backend queries

## Task 8: `ragFilesQueries.ts`

**Files:**
- Create: `packages/backend/src/db/queries/ragFilesQueries.ts`

- [ ] **Step 1:** Create:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type RagFileStatus =
  | 'pending' | 'uploading' | 'parsing' | 'chunking' | 'embedding' | 'done' | 'failed';

export interface RagFileRow {
  id: string;
  rag_store_id: string;
  tenant_id: string;
  org_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  status: RagFileStatus;
  status_error: string | null;
  gcs_object: string;
  da_operation: string | null;
  parsed_uri: string | null;
  created_at: string;
  updated_at: string;
}

const LIST_COLUMNS =
  'id, rag_store_id, tenant_id, org_id, filename, mime_type, size_bytes, page_count, status, status_error, gcs_object, da_operation, parsed_uri, created_at, updated_at';

function isRagFileRow(value: unknown): value is RagFileRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'rag_store_id' in value && 'tenant_id' in value && 'org_id' in value
    && 'filename' in value && 'status' in value && 'gcs_object' in value;
}

function mapRows(data: unknown[]): RagFileRow[] {
  return data.reduce<RagFileRow[]>((acc, row) => {
    if (isRagFileRow(row)) acc.push(row);
    return acc;
  }, []);
}

export interface CreatePendingInput {
  ragStoreId: string;
  tenantId: string;
  orgId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  gcsObject: string;
}

export async function createPendingFile(
  supabase: SupabaseClient,
  input: CreatePendingInput
): Promise<{ result: RagFileRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_files')
    .insert({
      rag_store_id: input.ragStoreId,
      tenant_id: input.tenantId,
      org_id: input.orgId,
      filename: input.filename,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      gcs_object: input.gcsObject,
      status: 'pending',
    })
    .select(LIST_COLUMNS)
    .single();
  if (error !== null) return { result: null, error: error.message };
  if (!isRagFileRow(data)) return { result: null, error: 'Invalid rag_file data' };
  return { result: data, error: null };
}

export async function getRagFileById(
  supabase: SupabaseClient,
  id: string
): Promise<{ result: RagFileRow | null; error: string | null }> {
  const { data, error } = await supabase.from('rag_files').select(LIST_COLUMNS).eq('id', id).maybeSingle();
  if (error !== null) return { result: null, error: error.message };
  if (data === null) return { result: null, error: null };
  if (!isRagFileRow(data)) return { result: null, error: 'Invalid rag_file data' };
  return { result: data, error: null };
}

export async function listFilesByStoreTenant(
  supabase: SupabaseClient,
  storeId: string,
  tenantId: string
): Promise<{ result: RagFileRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_files')
    .select(LIST_COLUMNS)
    .eq('rag_store_id', storeId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function updateStatus(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<RagFileRow, 'status' | 'status_error' | 'da_operation' | 'parsed_uri' | 'page_count'>>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('rag_files')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error !== null) return { error: error.message };
  return { error: null };
}

const CLAIM_BATCH_SIZE = 5;
const ACTIVE_STATUSES: RagFileStatus[] = ['parsing', 'chunking', 'embedding'];

export async function claimActiveFiles(
  supabase: SupabaseClient
): Promise<{ result: RagFileRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_files')
    .select(LIST_COLUMNS)
    .in('status', ACTIVE_STATUSES)
    .order('updated_at', { ascending: true })
    .limit(CLAIM_BATCH_SIZE);
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function deleteFile(
  supabase: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('rag_files').delete().eq('id', id);
  if (error !== null) return { error: error.message };
  return { error: null };
}
```

Note: `claimActiveFiles` uses a soft-claim (ORDER BY updated_at limit N). For v1 a single worker process is assumed; concurrent workers would need `SELECT ... FOR UPDATE SKIP LOCKED` via raw SQL/RPC. Leave a comment noting this and revisit if scaling out.

- [ ] **Step 2:** Typecheck:

```bash
npm run typecheck -w packages/backend
```
Expected: pass.

- [ ] **Step 3:** Commit:

```bash
git add packages/backend/src/db/queries/ragFilesQueries.ts
git commit -m "feat(backend): rag_files query module"
```

---

## Task 9: `ragChunksQueries.ts`

**Files:**
- Create: `packages/backend/src/db/queries/ragChunksQueries.ts`

- [ ] **Step 1:** Create:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

import type { SourcedChunk } from '../../rag/chunker.js';

export interface RagChunkRow {
  id: string;
  rag_file_id: string;
  rag_store_id: string;
  tenant_id: string;
  org_id: string;
  page_number: number | null;
  paragraph_idx: number | null;
  char_start: number | null;
  char_end: number | null;
  content: string;
  content_hash: string;
  token_count: number | null;
  created_at: string;
}

const LIST_COLUMNS =
  'id, rag_file_id, rag_store_id, tenant_id, org_id, page_number, paragraph_idx, char_start, char_end, content, content_hash, token_count, created_at';

function isRagChunkRow(value: unknown): value is RagChunkRow {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && 'rag_file_id' in value && 'content' in value;
}

function mapRows(data: unknown[]): RagChunkRow[] {
  return data.reduce<RagChunkRow[]>((acc, row) => {
    if (isRagChunkRow(row)) acc.push(row);
    return acc;
  }, []);
}

export interface InsertChunksInput {
  ragFileId: string;
  ragStoreId: string;
  tenantId: string;
  orgId: string;
  chunks: SourcedChunk[];
}

export async function insertChunks(
  supabase: SupabaseClient,
  input: InsertChunksInput
): Promise<{ inserted: number; error: string | null }> {
  if (input.chunks.length === 0) return { inserted: 0, error: null };
  const rows = input.chunks.map((c) => ({
    rag_file_id: input.ragFileId,
    rag_store_id: input.ragStoreId,
    tenant_id: input.tenantId,
    org_id: input.orgId,
    page_number: c.page_number,
    paragraph_idx: c.paragraph_idx,
    char_start: c.char_start,
    char_end: c.char_end,
    content: c.content,
    content_hash: c.content_hash,
    token_count: c.token_count,
  }));
  const { error } = await supabase.from('rag_chunks').insert(rows);
  if (error !== null) return { inserted: 0, error: error.message };
  return { inserted: rows.length, error: null };
}

export async function listChunksForFile(
  supabase: SupabaseClient,
  fileId: string,
  page: number,
  pageSize: number
): Promise<{ result: RagChunkRow[]; error: string | null }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error } = await supabase
    .from('rag_chunks')
    .select(LIST_COLUMNS)
    .eq('rag_file_id', fileId)
    .order('page_number', { ascending: true })
    .order('paragraph_idx', { ascending: true })
    .range(from, to);
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

export async function listChunkIdsWithoutEmbedding(
  supabase: SupabaseClient,
  fileId: string,
  limit: number
): Promise<{ ids: string[]; texts: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_chunks')
    .select('id, content')
    .eq('rag_file_id', fileId)
    .is('embedding', null)
    .limit(limit);
  if (error !== null) return { ids: [], texts: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  const ids: string[] = [];
  const texts: string[] = [];
  for (const r of rows) {
    if (typeof r !== 'object' || r === null) continue;
    const row = r as { id?: unknown; content?: unknown };
    if (typeof row.id === 'string' && typeof row.content === 'string') {
      ids.push(row.id);
      texts.push(row.content);
    }
  }
  return { ids, texts, error: null };
}

export async function setEmbedding(
  supabase: SupabaseClient,
  id: string,
  vector: number[]
): Promise<{ error: string | null }> {
  // pgvector accepts a string literal like "[1,2,3]" via supabase-js.
  const literal = `[${vector.join(',')}]`;
  const { error } = await supabase.from('rag_chunks').update({ embedding: literal }).eq('id', id);
  if (error !== null) return { error: error.message };
  return { error: null };
}

// Full-text content search within a (store, tenant) partition.
export interface ContentSearchInput {
  ragStoreId: string;
  tenantId: string;
  query: string;
  k: number;
}

export async function searchByContent(
  supabase: SupabaseClient,
  input: ContentSearchInput
): Promise<{ result: RagChunkRow[]; error: string | null }> {
  // Postgres FTS via textSearch. The 'simple' config matches the GIN index.
  const { data, error } = await supabase
    .from('rag_chunks')
    .select(LIST_COLUMNS)
    .eq('rag_store_id', input.ragStoreId)
    .eq('tenant_id', input.tenantId)
    .textSearch('content', input.query, { config: 'simple', type: 'plain' })
    .limit(input.k);
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  return { result: mapRows(rows), error: null };
}

// Semantic search via pgvector. Requires a Postgres RPC because supabase-js can't express
// "ORDER BY embedding <=> $vector" via the table builder. We pass a SQL function below.
export interface SemanticSearchInput {
  ragStoreId: string;
  tenantId: string;
  queryVector: number[];
  k: number;
}

export interface SemanticChunk extends RagChunkRow {
  distance: number;
}

export async function searchBySemantic(
  supabase: SupabaseClient,
  input: SemanticSearchInput
): Promise<{ result: SemanticChunk[]; error: string | null }> {
  const literal = `[${input.queryVector.join(',')}]`;
  const { data, error } = await supabase.rpc('rag_semantic_search', {
    p_rag_store_id: input.ragStoreId,
    p_tenant_id: input.tenantId,
    p_query_vector: literal,
    p_k: input.k,
  });
  if (error !== null) return { result: [], error: error.message };
  const rows: unknown[] = (data as unknown[] | null) ?? [];
  const out: SemanticChunk[] = [];
  for (const r of rows) {
    if (typeof r !== 'object' || r === null) continue;
    const row = r as Record<string, unknown>;
    if (!isRagChunkRow(row)) continue;
    const distance = typeof row.distance === 'number' ? row.distance : 0;
    out.push({ ...row, distance });
  }
  return { result: out, error: null };
}
```

- [ ] **Step 2:** The `rag_semantic_search` RPC doesn't exist yet. Append it to the migration `20260511130000_rag_pipeline.sql` (modify the existing file):

```sql

-- Semantic search RPC: scopes by (store, tenant), orders by cosine distance.
CREATE OR REPLACE FUNCTION public.rag_semantic_search(
  p_rag_store_id uuid,
  p_tenant_id    uuid,
  p_query_vector vector(768),
  p_k            integer
)
RETURNS TABLE (
  id            uuid,
  rag_file_id   uuid,
  rag_store_id  uuid,
  tenant_id     uuid,
  org_id        uuid,
  page_number   integer,
  paragraph_idx integer,
  char_start    integer,
  char_end      integer,
  content       text,
  content_hash  text,
  token_count   integer,
  created_at    timestamptz,
  distance      double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id, rag_file_id, rag_store_id, tenant_id, org_id, page_number, paragraph_idx,
         char_start, char_end, content, content_hash, token_count, created_at,
         (embedding <=> p_query_vector)::double precision AS distance
  FROM public.rag_chunks
  WHERE rag_store_id = p_rag_store_id
    AND tenant_id    = p_tenant_id
    AND embedding IS NOT NULL
  ORDER BY embedding <=> p_query_vector
  LIMIT p_k;
$$;

GRANT EXECUTE ON FUNCTION public.rag_semantic_search(uuid, uuid, vector(768), integer) TO authenticated;
```

- [ ] **Step 3:** Typecheck:

```bash
npm run typecheck -w packages/backend
```
Expected: pass.

- [ ] **Step 4:** Commit:

```bash
git add packages/backend/src/db/queries/ragChunksQueries.ts supabase/migrations/20260511130000_rag_pipeline.sql
git commit -m "feat(backend): rag_chunks queries + semantic search RPC"
```

---

## Task 10: `ragUsageQueries.ts`

**Files:**
- Create: `packages/backend/src/db/queries/ragUsageQueries.ts`

- [ ] **Step 1:** Create:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TenantUsage {
  files_count: number;
  pages_count: number;
  bytes_total: number;
}

function isUsageRow(value: unknown): value is TenantUsage {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row.files_count === 'number'
    && typeof row.pages_count === 'number'
    && typeof row.bytes_total === 'number';
}

export async function getTenantUsage(
  supabase: SupabaseClient,
  storeId: string,
  tenantId: string
): Promise<{ result: TenantUsage; error: string | null }> {
  const { data, error } = await supabase
    .from('rag_usage_by_tenant')
    .select('files_count, pages_count, bytes_total')
    .eq('rag_store_id', storeId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error !== null) return { result: { files_count: 0, pages_count: 0, bytes_total: 0 }, error: error.message };
  if (data === null) return { result: { files_count: 0, pages_count: 0, bytes_total: 0 }, error: null };
  if (!isUsageRow(data)) return { result: { files_count: 0, pages_count: 0, bytes_total: 0 }, error: 'invalid usage row' };
  return { result: data, error: null };
}
```

- [ ] **Step 2:** Typecheck + commit:

```bash
npm run typecheck -w packages/backend
git add packages/backend/src/db/queries/ragUsageQueries.ts
git commit -m "feat(backend): tenant rag usage aggregate query"
```

---

# Phase 4 — Worker

## Task 11: Worker state machine (`rag/workerLoop.ts`)

**Files:**
- Create: `packages/backend/src/rag/workerLoop.ts`

- [ ] **Step 1:** Create:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type RagFileRow,
  claimActiveFiles,
  getRagFileById,
  updateStatus,
} from '../db/queries/ragFilesQueries.js';
import {
  insertChunks,
  listChunkIdsWithoutEmbedding,
  setEmbedding,
} from '../db/queries/ragChunksQueries.js';
import { type DocumentAiPayload, maxPage, normalizeChunks } from './chunker.js';
import { checkOperation, submitBatch } from './documentAi.js';
import { embedTexts } from './embeddings.js';
import { listObjectsUnder, readJsonObject } from './gcs.js';

const EMBED_CHUNK_PAGE_SIZE = 100;

function log(msg: string): void {
  process.stdout.write(`[ragWorker] ${msg}\n`);
}

async function fail(supabase: SupabaseClient, file: RagFileRow, error: string): Promise<void> {
  log(`file ${file.id} failed: ${error}`);
  await updateStatus(supabase, file.id, { status: 'failed', status_error: error });
}

async function handleParsing(supabase: SupabaseClient, file: RagFileRow): Promise<void> {
  const opName = file.da_operation;
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
  // state.status === 'done'
  const parsedPrefix = file.parsed_uri?.replace(/^gs:\/\/[^/]+\//, '') ?? '';
  await updateStatus(supabase, file.id, { status: 'chunking', parsed_uri: parsedPrefix });
}

async function readAllParsedChunks(prefix: string): Promise<DocumentAiPayload> {
  const objects = await listObjectsUnder(prefix);
  const merged: DocumentAiPayload = { chunkedDocument: { chunks: [] } };
  for (const obj of objects) {
    if (!obj.endsWith('.json')) continue;
    const payload = await readJsonObject<DocumentAiPayload>(obj);
    const chunks = payload.chunkedDocument?.chunks ?? [];
    merged.chunkedDocument?.chunks?.push(...chunks);
  }
  return merged;
}

async function handleChunking(supabase: SupabaseClient, file: RagFileRow): Promise<void> {
  const prefix = file.parsed_uri ?? '';
  if (prefix === '') {
    await fail(supabase, file, 'chunking without parsed_uri');
    return;
  }
  const payload = await readAllParsedChunks(prefix);
  const chunks = normalizeChunks(payload);
  if (chunks.length === 0) {
    await fail(supabase, file, 'no chunks produced by Document AI');
    return;
  }
  const { error } = await insertChunks(supabase, {
    ragFileId: file.id,
    ragStoreId: file.rag_store_id,
    tenantId: file.tenant_id,
    orgId: file.org_id,
    chunks,
  });
  if (error !== null) {
    await fail(supabase, file, `insertChunks: ${error}`);
    return;
  }
  await updateStatus(supabase, file.id, {
    status: 'embedding',
    page_count: maxPage(chunks),
  });
}

async function handleEmbedding(supabase: SupabaseClient, file: RagFileRow): Promise<void> {
  const { ids, texts, error } = await listChunkIdsWithoutEmbedding(supabase, file.id, EMBED_CHUNK_PAGE_SIZE);
  if (error !== null) {
    await fail(supabase, file, `listChunks: ${error}`);
    return;
  }
  if (ids.length === 0) {
    await updateStatus(supabase, file.id, { status: 'done' });
    return;
  }
  const { vectors } = await embedTexts({ texts });
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const vector = vectors[i];
    if (id === undefined || vector === undefined) continue;
    const { error: setErr } = await setEmbedding(supabase, id, vector);
    if (setErr !== null) {
      await fail(supabase, file, `setEmbedding: ${setErr}`);
      return;
    }
  }
  // Leave the row in 'embedding' so the next tick continues until none remain.
}

async function dispatch(supabase: SupabaseClient, file: RagFileRow): Promise<void> {
  if (file.status === 'parsing')   { await handleParsing(supabase, file);   return; }
  if (file.status === 'chunking')  { await handleChunking(supabase, file);  return; }
  if (file.status === 'embedding') { await handleEmbedding(supabase, file); return; }
}

export async function tickOnce(supabase: SupabaseClient): Promise<void> {
  const { result, error } = await claimActiveFiles(supabase);
  if (error !== null) {
    log(`claim error: ${error}`);
    return;
  }
  for (const file of result) {
    try {
      await dispatch(supabase, file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await fail(supabase, file, msg);
    }
  }
}

// Called by routes when a fresh file is confirmed: submits Document AI batch + flips status.
export async function startParsing(supabase: SupabaseClient, fileId: string): Promise<void> {
  const { result, error } = await getRagFileById(supabase, fileId);
  if (error !== null || result === null) {
    log(`startParsing: file ${fileId} not found`);
    return;
  }
  const outputPrefix = `parsed/${result.id}/`;
  try {
    const { operationName, outputGcsUri } = await submitBatch({
      inputObjectPath: result.gcs_object,
      outputPrefix,
      mimeType: result.mime_type,
    });
    await updateStatus(supabase, fileId, {
      status: 'parsing',
      da_operation: operationName,
      parsed_uri: outputGcsUri.replace(/^gs:\/\/[^/]+\//, ''),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateStatus(supabase, fileId, { status: 'failed', status_error: msg });
  }
}
```

- [ ] **Step 2:** Typecheck:

```bash
npm run typecheck -w packages/backend
```

- [ ] **Step 3:** Commit:

```bash
git add packages/backend/src/rag/workerLoop.ts
git commit -m "feat(backend): rag worker state machine"
```

---

## Task 12: Worker entrypoint + wire into server startup

**Files:**
- Create: `packages/backend/src/workers/ragWorker.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1:** Create `packages/backend/src/workers/ragWorker.ts`:

```ts
import { createServiceClient } from '../db/queries/executionAuthQueries.js';
import { readRagConfig } from '../rag/config.js';
import { tickOnce } from '../rag/workerLoop.js';

const POLL_INTERVAL_MS = 5000;

function log(msg: string): void {
  process.stdout.write(`[ragWorker] ${msg}\n`);
}

let timer: NodeJS.Timeout | null = null;

export function startRagWorker(): void {
  const { config } = readRagConfig();
  if (config === null) {
    log('disabled (no RAG config)');
    return;
  }
  const supabase = createServiceClient();
  log('started');
  const tick = async () => {
    try {
      await tickOnce(supabase);
    } catch (err) {
      log(`tick error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    }
  };
  void tick();
}

export function stopRagWorker(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}
```

Note: `createServiceClient()` returns a Supabase client with the service-role key (bypasses RLS). Confirm by reading `executionAuthQueries.ts`. If it doesn't exist with that name, find the equivalent (e.g. `serviceClient.ts`) and import from there.

- [ ] **Step 2:** Modify `packages/backend/src/server.ts`: add the worker startup call at the bottom of `createApp` (or wherever workers are currently started — look for `resumeWorker` startup pattern and follow it).

Add import:
```ts
import { startRagWorker } from './workers/ragWorker.js';
```

Then after `createApp(...)` returns, or wherever other workers are kicked off, call `startRagWorker()`.

- [ ] **Step 3:** Typecheck + commit:

```bash
npm run typecheck -w packages/backend
git add packages/backend/src/workers/ragWorker.ts packages/backend/src/server.ts
git commit -m "feat(backend): start the rag worker on server boot"
```

---

# Phase 5 — Backend routes

## Task 13: Route helpers

**Files:**
- Create: `packages/backend/src/routes/ragStores/ragFiles/ragFileHelpers.ts`

- [ ] **Step 1:** Create:

```ts
import type { Request } from 'express';

interface StoreIdParams { storeId?: string }
interface FileIdParams { id?: string }

export function getStoreIdParam(req: Request): string | undefined {
  const { storeId }: StoreIdParams = req.params;
  if (typeof storeId === 'string' && storeId !== '') return storeId;
  return undefined;
}

export function getFileIdParam(req: Request): string | undefined {
  const { id }: FileIdParams = req.params;
  if (typeof id === 'string' && id !== '') return id;
  return undefined;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

export function parseString(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) return undefined;
  const value = body[key];
  if (typeof value === 'string' && value !== '') return value;
  return undefined;
}

export function parseNumber(body: unknown, key: string): number | undefined {
  if (!isRecord(body)) return undefined;
  const value = body[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/backend/src/routes/ragStores/ragFiles/ragFileHelpers.ts
git commit -m "feat(backend): rag_files route helpers"
```

---

## Task 14: `initUpload` route

**Files:**
- Create: `packages/backend/src/routes/ragStores/ragFiles/initUpload.ts`

- [ ] **Step 1:** Create:

```ts
import type { Request } from 'express';

import { createPendingFile } from '../../../db/queries/ragFilesQueries.js';
import { getRagStoreBySlug } from '../../../db/queries/ragStoresQueries.js';
import { createUploadSignedUrl } from '../../../rag/gcs.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getStoreIdParam, parseNumber, parseString } from './ragFileHelpers.js';

const MAX_FILE_BYTES = 209_715_200;

export async function handleInitUpload(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  const tenantId = parseString(req.body, 'tenantId');
  const filename = parseString(req.body, 'filename');
  const mimeType = parseString(req.body, 'mimeType');
  const sizeBytes = parseNumber(req.body, 'sizeBytes');

  if (storeId === undefined || tenantId === undefined || filename === undefined
      || mimeType === undefined || sizeBytes === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'missing storeId, tenantId, filename, mimeType, or sizeBytes' });
    return;
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file exceeds 200 MB limit' });
    return;
  }

  try {
    // Look up store to discover org_id (store is uniquely identified by id here).
    const { data, error: storeErr } = await supabase
      .from('rag_stores')
      .select('id, org_id')
      .eq('id', storeId)
      .maybeSingle();
    if (storeErr !== null || data === null) {
      res.status(HTTP_BAD_REQUEST).json({ error: 'store not found' });
      return;
    }
    const orgId = typeof (data as { org_id?: unknown }).org_id === 'string'
      ? ((data as { org_id: string }).org_id)
      : '';
    if (orgId === '') {
      res.status(HTTP_INTERNAL_ERROR).json({ error: 'store has no org_id' });
      return;
    }

    const fileId = crypto.randomUUID();
    const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
    const gcsObject = `uploads/${orgId}/${tenantId}/${storeId}/${fileId}/${safeName}`;

    const uploadUrl = await createUploadSignedUrl(gcsObject, mimeType);

    const { result, error } = await createPendingFile(supabase, {
      ragStoreId: storeId,
      tenantId,
      orgId,
      filename,
      mimeType,
      sizeBytes,
      gcsObject,
    });
    if (error !== null || result === null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: error ?? 'create failed' });
      return;
    }
    res.status(HTTP_OK).json({ fileId: result.id, uploadUrl, gcsObject });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

Note: `getRagStoreBySlug` is imported but not used here (we fetch by id directly). The import is fine to remove during implementation if not needed.

- [ ] **Step 2:** Commit:

```bash
git add packages/backend/src/routes/ragStores/ragFiles/initUpload.ts
git commit -m "feat(backend): init upload — signed URL + pending rag_file row"
```

---

## Task 15: `confirmUpload` route

**Files:**
- Create: `packages/backend/src/routes/ragStores/ragFiles/confirmUpload.ts`

- [ ] **Step 1:** Create:

```ts
import type { Request } from 'express';

import { startParsing } from '../../../rag/workerLoop.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getFileIdParam } from './ragFileHelpers.js';

export async function handleConfirmUpload(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const fileId = getFileIdParam(req);
  if (fileId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file id required' });
    return;
  }
  try {
    await startParsing(supabase, fileId);
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/backend/src/routes/ragStores/ragFiles/confirmUpload.ts
git commit -m "feat(backend): confirm upload kicks off Document AI batch"
```

---

## Task 16: List files + get single file routes

**Files:**
- Create: `packages/backend/src/routes/ragStores/ragFiles/listFiles.ts`
- Create: `packages/backend/src/routes/ragStores/ragFiles/getFile.ts`

- [ ] **Step 1:** `listFiles.ts`:

```ts
import type { Request } from 'express';

import { listFilesByStoreTenant } from '../../../db/queries/ragFilesQueries.js';
import { getTenantUsage } from '../../../db/queries/ragUsageQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getStoreIdParam } from './ragFileHelpers.js';

export async function handleListFiles(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : '';
  if (storeId === undefined || tenantId === '') {
    res.status(HTTP_BAD_REQUEST).json({ error: 'storeId and tenantId required' });
    return;
  }
  try {
    const [filesRes, usageRes] = await Promise.all([
      listFilesByStoreTenant(supabase, storeId, tenantId),
      getTenantUsage(supabase, storeId, tenantId),
    ]);
    if (filesRes.error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error: filesRes.error });
      return;
    }
    res.status(HTTP_OK).json({ files: filesRes.result, usage: usageRes.result });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 2:** `getFile.ts`:

```ts
import type { Request } from 'express';

import { getRagFileById } from '../../../db/queries/ragFilesQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getFileIdParam } from './ragFileHelpers.js';

export async function handleGetFile(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const fileId = getFileIdParam(req);
  if (fileId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file id required' });
    return;
  }
  try {
    const { result, error } = await getRagFileById(supabase, fileId);
    if (error !== null) { res.status(HTTP_INTERNAL_ERROR).json({ error }); return; }
    if (result === null) { res.status(HTTP_NOT_FOUND).json({ error: 'not found' }); return; }
    res.status(HTTP_OK).json(result);
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 3:** Commit:

```bash
git add packages/backend/src/routes/ragStores/ragFiles/listFiles.ts packages/backend/src/routes/ragStores/ragFiles/getFile.ts
git commit -m "feat(backend): list + get rag_files routes"
```

---

## Task 17: Get chunks route

**Files:**
- Create: `packages/backend/src/routes/ragStores/ragFiles/getChunks.ts`

- [ ] **Step 1:** Create:

```ts
import type { Request } from 'express';

import { listChunksForFile } from '../../../db/queries/ragChunksQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getFileIdParam } from './ragFileHelpers.js';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function handleGetChunks(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const fileId = getFileIdParam(req);
  if (fileId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file id required' });
    return;
  }
  const pageRaw = typeof req.query.page === 'string' ? Number(req.query.page) : 1;
  const sizeRaw = typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : DEFAULT_PAGE_SIZE;
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const pageSize = Math.min(Math.max(1, Math.floor(sizeRaw)), MAX_PAGE_SIZE);

  try {
    const { result, error } = await listChunksForFile(supabase, fileId, page, pageSize);
    if (error !== null) { res.status(HTTP_INTERNAL_ERROR).json({ error }); return; }
    res.status(HTTP_OK).json({ chunks: result, page, pageSize });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/backend/src/routes/ragStores/ragFiles/getChunks.ts
git commit -m "feat(backend): paginated chunks for a rag_file"
```

---

## Task 18: Delete file route

**Files:**
- Create: `packages/backend/src/routes/ragStores/ragFiles/deleteFile.ts`

- [ ] **Step 1:** Create:

```ts
import type { Request } from 'express';

import { deleteFile, getRagFileById } from '../../../db/queries/ragFilesQueries.js';
import { deleteObject, deletePrefix } from '../../../rag/gcs.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getFileIdParam } from './ragFileHelpers.js';

export async function handleDeleteFile(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const fileId = getFileIdParam(req);
  if (fileId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file id required' });
    return;
  }
  try {
    const { result } = await getRagFileById(supabase, fileId);
    if (result !== null) {
      await deleteObject(result.gcs_object);
      if (result.parsed_uri !== null && result.parsed_uri !== '') {
        await deletePrefix(result.parsed_uri);
      }
    }
    const { error } = await deleteFile(supabase, fileId);
    if (error !== null) {
      res.status(HTTP_INTERNAL_ERROR).json({ error });
      return;
    }
    res.status(HTTP_OK).json({ success: true });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/backend/src/routes/ragStores/ragFiles/deleteFile.ts
git commit -m "feat(backend): delete rag_file (cascades chunks + cleans GCS)"
```

---

## Task 19: Search route (3 modes)

**Files:**
- Create: `packages/backend/src/routes/ragStores/ragFiles/searchChunks.ts`

- [ ] **Step 1:** Create:

```ts
import type { Request } from 'express';

import { listFilesByStoreTenant } from '../../../db/queries/ragFilesQueries.js';
import { searchByContent, searchBySemantic } from '../../../db/queries/ragChunksQueries.js';
import { embedQuery } from '../../../rag/embeddings.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  extractErrorMessage,
} from '../../routeHelpers.js';
import { getStoreIdParam, parseNumber, parseString } from './ragFileHelpers.js';

const DEFAULT_K = 20;
const MAX_K = 50;

export async function handleSearchChunks(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const storeId = getStoreIdParam(req);
  const tenantId = parseString(req.body, 'tenantId');
  const mode = parseString(req.body, 'mode');
  const query = parseString(req.body, 'query');
  const kRaw = parseNumber(req.body, 'k') ?? DEFAULT_K;
  const k = Math.min(Math.max(1, Math.floor(kRaw)), MAX_K);

  if (storeId === undefined || tenantId === undefined || query === undefined || mode === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'storeId, tenantId, mode, query required' });
    return;
  }

  try {
    if (mode === 'name') {
      const { result, error } = await listFilesByStoreTenant(supabase, storeId, tenantId);
      if (error !== null) { res.status(HTTP_INTERNAL_ERROR).json({ error }); return; }
      const needle = query.toLowerCase();
      const matches = result.filter((f) => f.filename.toLowerCase().includes(needle));
      res.status(HTTP_OK).json({ mode, files: matches });
      return;
    }
    if (mode === 'content') {
      const { result, error } = await searchByContent(supabase, { ragStoreId: storeId, tenantId, query, k });
      if (error !== null) { res.status(HTTP_INTERNAL_ERROR).json({ error }); return; }
      res.status(HTTP_OK).json({ mode, chunks: result });
      return;
    }
    if (mode === 'semantic') {
      const queryVector = await embedQuery(query);
      const { result, error } = await searchBySemantic(supabase, { ragStoreId: storeId, tenantId, queryVector, k });
      if (error !== null) { res.status(HTTP_INTERNAL_ERROR).json({ error }); return; }
      res.status(HTTP_OK).json({ mode, chunks: result });
      return;
    }
    res.status(HTTP_BAD_REQUEST).json({ error: `unknown mode: ${mode}` });
  } catch (err) {
    res.status(HTTP_INTERNAL_ERROR).json({ error: extractErrorMessage(err) });
  }
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/backend/src/routes/ragStores/ragFiles/searchChunks.ts
git commit -m "feat(backend): search (name / content / semantic) within (store, tenant)"
```

---

## Task 20: SSE stream route

**Files:**
- Create: `packages/backend/src/routes/ragStores/ragFiles/streamStatus.ts`

- [ ] **Step 1:** Create:

```ts
import type { Request } from 'express';

import { getRagFileById } from '../../../db/queries/ragFilesQueries.js';
import {
  type AuthenticatedLocals,
  type AuthenticatedResponse,
  HTTP_BAD_REQUEST,
} from '../../routeHelpers.js';
import { getFileIdParam } from './ragFileHelpers.js';

const POLL_MS = 1000;
const TERMINAL_STATUSES = new Set(['done', 'failed']);

export async function handleStreamStatus(req: Request, res: AuthenticatedResponse): Promise<void> {
  const { supabase }: AuthenticatedLocals = res.locals;
  const fileId = getFileIdParam(req);
  if (fileId === undefined) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'file id required' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let lastStatus = '';
  let closed = false;
  req.on('close', () => { closed = true; });

  const tick = async (): Promise<void> => {
    if (closed) return;
    const { result } = await getRagFileById(supabase, fileId);
    if (result === null) {
      res.write('event: gone\ndata: {}\n\n');
      res.end();
      return;
    }
    const status = result.status;
    if (status !== lastStatus) {
      lastStatus = status;
      const payload = JSON.stringify({
        status,
        statusError: result.status_error,
        pageCount: result.page_count,
      });
      res.write(`data: ${payload}\n\n`);
    }
    if (TERMINAL_STATUSES.has(status)) {
      res.end();
      return;
    }
    setTimeout(() => { void tick(); }, POLL_MS);
  };
  void tick();
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/backend/src/routes/ragStores/ragFiles/streamStatus.ts
git commit -m "feat(backend): SSE stream for rag_file status"
```

---

## Task 21: Router + mount

**Files:**
- Create: `packages/backend/src/routes/ragStores/ragFiles/ragFilesRouter.ts`
- Modify: `packages/backend/src/routes/ragStores/ragStoresRouter.ts`

- [ ] **Step 1:** Create the sub-router:

```ts
import express from 'express';

import { requireAuth } from '../../../middleware/auth.js';
import { handleConfirmUpload } from './confirmUpload.js';
import { handleDeleteFile } from './deleteFile.js';
import { handleGetChunks } from './getChunks.js';
import { handleGetFile } from './getFile.js';
import { handleInitUpload } from './initUpload.js';
import { handleListFiles } from './listFiles.js';
import { handleSearchChunks } from './searchChunks.js';
import { handleStreamStatus } from './streamStatus.js';

export const ragFilesRouter = express.Router({ mergeParams: true });
ragFilesRouter.use(requireAuth);

ragFilesRouter.post('/init',          handleInitUpload);
ragFilesRouter.get('/',               handleListFiles);
ragFilesRouter.get('/:id',            handleGetFile);
ragFilesRouter.get('/:id/chunks',     handleGetChunks);
ragFilesRouter.get('/:id/stream',     handleStreamStatus);
ragFilesRouter.post('/:id/start',     handleConfirmUpload);
ragFilesRouter.delete('/:id',         handleDeleteFile);
```

And a separate search router (search is on the store, not per-file):

Update the existing `packages/backend/src/routes/ragStores/ragStoresRouter.ts` — add these two lines (and the appropriate imports):

```ts
import { ragFilesRouter } from './ragFiles/ragFilesRouter.js';
import { handleSearchChunks } from './ragFiles/searchChunks.js';

// after the existing routes:
ragStoresRouter.use('/:storeId/files', ragFilesRouter);
ragStoresRouter.post('/:storeId/search', handleSearchChunks);
```

- [ ] **Step 2:** Typecheck:

```bash
npm run typecheck -w packages/backend
```

- [ ] **Step 3:** Commit:

```bash
git add packages/backend/src/routes/ragStores/
git commit -m "feat(backend): mount rag_files sub-router + search route"
```

---

# Phase 6 — Frontend

## Task 22: Web lib `ragFiles.ts` (server fetchers)

**Files:**
- Create: `packages/web/app/lib/ragFiles.ts`

- [ ] **Step 1:** Create:

```ts
import { fetchFromBackend } from './backendProxy';

export type RagFileStatus =
  | 'pending' | 'uploading' | 'parsing' | 'chunking' | 'embedding' | 'done' | 'failed';

export interface RagFileRow {
  id: string;
  rag_store_id: string;
  tenant_id: string;
  org_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  status: RagFileStatus;
  status_error: string | null;
  gcs_object: string;
  da_operation: string | null;
  parsed_uri: string | null;
  created_at: string;
  updated_at: string;
}

export interface RagChunkRow {
  id: string;
  rag_file_id: string;
  page_number: number | null;
  paragraph_idx: number | null;
  char_start: number | null;
  char_end: number | null;
  content: string;
  content_hash: string;
  token_count: number | null;
  created_at: string;
}

export interface SemanticChunk extends RagChunkRow {
  distance: number;
}

export interface TenantUsage {
  files_count: number;
  pages_count: number;
  bytes_total: number;
}

export interface InitUploadInput {
  storeId: string;
  tenantId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface InitUploadResponse {
  fileId: string;
  uploadUrl: string;
  gcsObject: string;
}

function isInitUploadResponse(v: unknown): v is InitUploadResponse {
  if (typeof v !== 'object' || v === null) return false;
  return 'fileId' in v && 'uploadUrl' in v && 'gcsObject' in v;
}

function extractError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export async function initUpload(
  input: InitUploadInput
): Promise<{ result: InitUploadResponse | null; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'POST',
      `/rag-stores/${encodeURIComponent(input.storeId)}/files/init`,
      { tenantId: input.tenantId, filename: input.filename, mimeType: input.mimeType, sizeBytes: input.sizeBytes }
    );
    if (!isInitUploadResponse(data)) return { result: null, error: 'invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: null, error: extractError(err) };
  }
}

export async function confirmUpload(
  storeId: string,
  fileId: string
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend(
      'POST',
      `/rag-stores/${encodeURIComponent(storeId)}/files/${encodeURIComponent(fileId)}/start`
    );
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export interface ListFilesResponse {
  files: RagFileRow[];
  usage: TenantUsage;
}

function isListFilesResponse(v: unknown): v is ListFilesResponse {
  return typeof v === 'object' && v !== null && 'files' in v && 'usage' in v;
}

export async function listFiles(
  storeId: string,
  tenantId: string
): Promise<{ result: ListFilesResponse; error: string | null }> {
  const empty: ListFilesResponse = { files: [], usage: { files_count: 0, pages_count: 0, bytes_total: 0 } };
  try {
    const data = await fetchFromBackend(
      'GET',
      `/rag-stores/${encodeURIComponent(storeId)}/files?tenantId=${encodeURIComponent(tenantId)}`
    );
    if (!isListFilesResponse(data)) return { result: empty, error: 'invalid response' };
    return { result: data, error: null };
  } catch (err) {
    return { result: empty, error: extractError(err) };
  }
}

export async function deleteFile(
  storeId: string,
  fileId: string
): Promise<{ error: string | null }> {
  try {
    await fetchFromBackend(
      'DELETE',
      `/rag-stores/${encodeURIComponent(storeId)}/files/${encodeURIComponent(fileId)}`
    );
    return { error: null };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function getChunks(
  storeId: string,
  fileId: string,
  page: number,
  pageSize: number
): Promise<{ result: RagChunkRow[]; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'GET',
      `/rag-stores/${encodeURIComponent(storeId)}/files/${encodeURIComponent(fileId)}/chunks?page=${page}&pageSize=${pageSize}`
    );
    if (typeof data !== 'object' || data === null || !Array.isArray((data as { chunks?: unknown }).chunks)) {
      return { result: [], error: 'invalid response' };
    }
    return { result: (data as { chunks: RagChunkRow[] }).chunks, error: null };
  } catch (err) {
    return { result: [], error: extractError(err) };
  }
}

export type SearchMode = 'name' | 'content' | 'semantic';

export interface SearchResponse {
  mode: SearchMode;
  files?: RagFileRow[];
  chunks?: SemanticChunk[];
}

export async function search(
  storeId: string,
  tenantId: string,
  mode: SearchMode,
  query: string
): Promise<{ result: SearchResponse; error: string | null }> {
  try {
    const data = await fetchFromBackend(
      'POST',
      `/rag-stores/${encodeURIComponent(storeId)}/search`,
      { tenantId, mode, query }
    );
    if (typeof data !== 'object' || data === null) {
      return { result: { mode }, error: 'invalid response' };
    }
    return { result: data as SearchResponse, error: null };
  } catch (err) {
    return { result: { mode }, error: extractError(err) };
  }
}
```

- [ ] **Step 2:** Typecheck + commit:

```bash
npm run typecheck -w packages/web
git add packages/web/app/lib/ragFiles.ts
git commit -m "feat(web): rag_files server-side fetchers"
```

---

## Task 23: Web server actions

**Files:**
- Create: `packages/web/app/actions/ragFiles.ts`

- [ ] **Step 1:** Create:

```ts
'use server';

import {
  type InitUploadInput,
  type InitUploadResponse,
  type ListFilesResponse,
  type RagChunkRow,
  type SearchMode,
  type SearchResponse,
  confirmUpload as confirmUploadLib,
  deleteFile as deleteFileLib,
  getChunks as getChunksLib,
  initUpload as initUploadLib,
  listFiles as listFilesLib,
  search as searchLib,
} from '@/app/lib/ragFiles';
import { serverError } from '@/app/lib/serverLogger';

export async function initUploadAction(
  input: InitUploadInput
): Promise<{ result: InitUploadResponse | null; error: string | null }> {
  const res = await initUploadLib(input);
  if (res.error !== null) serverError('[initUploadAction]', res.error);
  return res;
}

export async function confirmUploadAction(
  storeId: string,
  fileId: string
): Promise<{ error: string | null }> {
  const res = await confirmUploadLib(storeId, fileId);
  if (res.error !== null) serverError('[confirmUploadAction]', res.error);
  return res;
}

export async function listFilesAction(
  storeId: string,
  tenantId: string
): Promise<{ result: ListFilesResponse; error: string | null }> {
  return listFilesLib(storeId, tenantId);
}

export async function deleteFileAction(
  storeId: string,
  fileId: string
): Promise<{ error: string | null }> {
  const res = await deleteFileLib(storeId, fileId);
  if (res.error !== null) serverError('[deleteFileAction]', res.error);
  return res;
}

export async function getChunksAction(
  storeId: string,
  fileId: string,
  page: number,
  pageSize: number
): Promise<{ result: RagChunkRow[]; error: string | null }> {
  return getChunksLib(storeId, fileId, page, pageSize);
}

export async function searchAction(
  storeId: string,
  tenantId: string,
  mode: SearchMode,
  query: string
): Promise<{ result: SearchResponse; error: string | null }> {
  return searchLib(storeId, tenantId, mode, query);
}
```

- [ ] **Step 2:** Typecheck + commit:

```bash
npm run typecheck -w packages/web
git add packages/web/app/actions/ragFiles.ts
git commit -m "feat(web): rag_files server actions for client components"
```

---

## Task 24: SSE proxy route

**Files:**
- Create: `packages/web/app/api/rag-files/[id]/stream/route.ts`

- [ ] **Step 1:** Create:

```ts
import { createClient } from '@/app/lib/supabase/server';
import { type NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const UNAUTHORIZED = 401;
const INTERNAL_ERROR = 500;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const storeId = req.nextUrl.searchParams.get('storeId') ?? '';
  if (storeId === '') return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session === null) return NextResponse.json({ error: 'unauthorized' }, { status: UNAUTHORIZED });

  const upstream = await fetch(
    `${API_URL}/rag-stores/${encodeURIComponent(storeId)}/files/${encodeURIComponent(id)}/stream`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` },
    }
  );
  if (upstream.body === null) {
    return NextResponse.json({ error: 'upstream had no body' }, { status: INTERNAL_ERROR });
  }
  const headers = new Headers();
  headers.set('Content-Type', 'text/event-stream');
  headers.set('Cache-Control', 'no-cache, no-transform');
  return new Response(upstream.body, { status: upstream.status, headers });
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/web/app/api/rag-files
git commit -m "feat(web): SSE proxy from Next.js route to backend"
```

---

## Task 25: `useRagUpload` hook

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/useRagUpload.ts`

- [ ] **Step 1:** Create:

```ts
'use client';

import { confirmUploadAction, initUploadAction } from '@/app/actions/ragFiles';
import { useCallback, useState } from 'react';

interface UseRagUploadInput {
  storeId: string;
  tenantId: string;
  onFileQueued: (fileId: string) => void;
}

export interface UploadResult {
  fileId: string;
  filename: string;
  error?: string;
}

export function useRagUpload({ storeId, tenantId, onFileQueued }: UseRagUploadInput): {
  uploading: boolean;
  uploadFiles: (files: FileList) => Promise<UploadResult[]>;
} {
  const [uploading, setUploading] = useState(false);

  const uploadOne = useCallback(async (file: File): Promise<UploadResult> => {
    const { result, error } = await initUploadAction({
      storeId,
      tenantId,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    });
    if (result === null || error !== null) return { fileId: '', filename: file.name, error: error ?? 'init failed' };
    const putRes = await fetch(result.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!putRes.ok) return { fileId: result.fileId, filename: file.name, error: `upload failed: ${String(putRes.status)}` };
    const { error: confirmErr } = await confirmUploadAction(storeId, result.fileId);
    if (confirmErr !== null) return { fileId: result.fileId, filename: file.name, error: confirmErr };
    onFileQueued(result.fileId);
    return { fileId: result.fileId, filename: file.name };
  }, [onFileQueued, storeId, tenantId]);

  const uploadFiles = useCallback(async (files: FileList): Promise<UploadResult[]> => {
    setUploading(true);
    const results: UploadResult[] = [];
    for (const file of Array.from(files)) {
      const out = await uploadOne(file);
      results.push(out);
    }
    setUploading(false);
    return results;
  }, [uploadOne]);

  return { uploading, uploadFiles };
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/rag/\[storeSlug\]/useRagUpload.ts
git commit -m "feat(web): useRagUpload hook (init → PUT → confirm)"
```

---

## Task 26: `FileUploadDropzone`

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/FileUploadDropzone.tsx`

- [ ] **Step 1:** Create:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';

interface FileUploadDropzoneProps {
  uploading: boolean;
  onFiles: (files: FileList) => void;
}

export function FileUploadDropzone({ uploading, onFiles }: FileUploadDropzoneProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragUpload');
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave() {
    setDragging(false);
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
  }
  function onPick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files !== null && e.target.files.length > 0) {
      onFiles(e.target.files);
      e.target.value = '';
    }
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-8 text-xs transition-colors ${
        dragging ? 'bg-input/40 border-primary' : 'border-border'
      }`}
    >
      <Upload className="size-5 text-muted-foreground" />
      <span className="text-muted-foreground">{dragging ? t('drop') : t('idle')}</span>
      <Button size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
        {uploading ? t('uploading') : t('addFiles')}
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/rag/\[storeSlug\]/FileUploadDropzone.tsx
git commit -m "feat(web): FileUploadDropzone for RAG files"
```

---

## Task 27: `FileStatusStream`

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/FileStatusStream.tsx`

- [ ] **Step 1:** Create:

```tsx
'use client';

import type { RagFileStatus } from '@/app/lib/ragFiles';
import { useEffect, useState } from 'react';

interface FileStatusStreamProps {
  fileId: string;
  storeId: string;
  initialStatus: RagFileStatus;
  initialError: string | null;
  onTerminal: () => void;
  children: (state: { status: RagFileStatus; error: string | null }) => React.ReactNode;
}

interface SsePayload {
  status?: RagFileStatus;
  statusError?: string | null;
}

const TERMINAL = new Set<RagFileStatus>(['done', 'failed']);

export function FileStatusStream({
  fileId,
  storeId,
  initialStatus,
  initialError,
  onTerminal,
  children,
}: FileStatusStreamProps): React.JSX.Element {
  const [status, setStatus] = useState<RagFileStatus>(initialStatus);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    if (TERMINAL.has(initialStatus)) return;
    const url = `/api/rag-files/${encodeURIComponent(fileId)}/stream?storeId=${encodeURIComponent(storeId)}`;
    const es = new EventSource(url);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as SsePayload;
        if (data.status !== undefined) setStatus(data.status);
        if (data.statusError !== undefined) setError(data.statusError);
        if (data.status !== undefined && TERMINAL.has(data.status)) {
          es.close();
          onTerminal();
        }
      } catch {
        // ignore malformed event
      }
    };
    es.onerror = () => { es.close(); };
    return () => { es.close(); };
  }, [fileId, storeId, initialStatus, onTerminal]);

  return <>{children({ status, error })}</>;
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/rag/\[storeSlug\]/FileStatusStream.tsx
git commit -m "feat(web): SSE stream component for live status"
```

---

## Task 28: `FileRow`

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/FileRow.tsx`

- [ ] **Step 1:** Create:

```tsx
'use client';

import { deleteFileAction } from '@/app/actions/ragFiles';
import type { RagFileRow, RagFileStatus } from '@/app/lib/ragFiles';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ChevronRight, FileText, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { FileStatusStream } from './FileStatusStream';

interface FileRowProps {
  storeId: string;
  file: RagFileRow;
  onOpenChunks: (file: RagFileRow) => void;
  onDeleted: (fileId: string) => void;
  onStatusReachedDone: (fileId: string) => void;
}

function StatusPill({ status, error }: { status: RagFileStatus; error: string | null }): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragStatus');
  const color =
    status === 'done'    ? 'bg-emerald-500/15 text-emerald-600' :
    status === 'failed'  ? 'bg-destructive/15 text-destructive' :
    'bg-input/60 text-muted-foreground';
  const title = status === 'failed' && error !== null ? error : undefined;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${color}`} title={title}>
      {t(status)}
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function FileRow({
  storeId, file, onOpenChunks, onDeleted, onStatusReachedDone,
}: FileRowProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragFiles');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    await deleteFileAction(storeId, file.id);
    setDeleting(false);
    setConfirmOpen(false);
    onDeleted(file.id);
  }

  return (
    <FileStatusStream
      fileId={file.id}
      storeId={storeId}
      initialStatus={file.status}
      initialError={file.status_error}
      onTerminal={() => onStatusReachedDone(file.id)}
    >
      {({ status, error }) => (
        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-xs font-medium">{file.filename}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {formatBytes(file.size_bytes)}
              {file.page_count !== null && (
                <> · {t('pageCount', { count: file.page_count })}</>
              )}
            </span>
          </div>
          <StatusPill status={status} error={error} />
          {status === 'done' && (
            <Button variant="ghost" size="icon" aria-label={t('openChunks')} onClick={() => onOpenChunks(file)}>
              <ChevronRight className="size-4" />
            </Button>
          )}
          <Button variant="destructive" size="icon" aria-label={t('remove')} onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" />
          </Button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('deleteDescription')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>{t('deleteCancel')}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={deleting} onClick={handleDelete}>
                  {t('deleteConfirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </FileStatusStream>
  );
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/rag/\[storeSlug\]/FileRow.tsx
git commit -m "feat(web): FileRow with live status + delete"
```

---

## Task 29: `FileChunksDrawer`

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/FileChunksDrawer.tsx`

- [ ] **Step 1:** Create:

```tsx
'use client';

import { getChunksAction } from '@/app/actions/ragFiles';
import type { RagChunkRow, RagFileRow } from '@/app/lib/ragFiles';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface FileChunksDrawerProps {
  storeId: string;
  file: RagFileRow | null;
  onOpenChange: (open: boolean) => void;
}

const PAGE_SIZE = 25;

export function FileChunksDrawer({
  storeId,
  file,
  onOpenChange,
}: FileChunksDrawerProps): React.JSX.Element | null {
  const t = useTranslations('knowledgeBase.ragChunks');
  const [chunks, setChunks] = useState<RagChunkRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (file === null) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { result } = await getChunksAction(storeId, file.id, page, PAGE_SIZE);
      if (!cancelled) {
        setChunks(result);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [file, page, storeId]);

  if (file === null) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{file.filename}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          {loading ? (
            <span className="text-xs text-muted-foreground">{t('loading')}</span>
          ) : (
            chunks.map((c) => (
              <div key={c.id} className="rounded-md border p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  <span>{t('page', { page: c.page_number ?? 0 })}</span>
                  <span>·</span>
                  <span>{t('paragraph', { idx: c.paragraph_idx ?? 0 })}</span>
                  {c.token_count !== null && (
                    <>
                      <span>·</span>
                      <span>{t('tokens', { count: c.token_count })}</span>
                    </>
                  )}
                </div>
                <p className="text-xs whitespace-pre-wrap">{c.content}</p>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-between items-center pt-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t('prev')}
          </Button>
          <span className="text-[11px] font-mono text-muted-foreground">{t('page', { page })}</span>
          <Button size="sm" variant="outline" disabled={chunks.length < PAGE_SIZE} onClick={() => setPage(page + 1)}>
            {t('next')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2:** Commit:

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/rag/\[storeSlug\]/FileChunksDrawer.tsx
git commit -m "feat(web): chunks drawer with audit metadata"
```

---

## Task 30: `RagSearchBar` + `SearchResults`

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagSearchBar.tsx`
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/SearchResults.tsx`

- [ ] **Step 1:** `RagSearchBar.tsx`:

```tsx
'use client';

import type { SearchMode } from '@/app/lib/ragFiles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

interface RagSearchBarProps {
  onSearch: (mode: SearchMode, query: string) => void;
  busy: boolean;
}

const MODES: SearchMode[] = ['name', 'content', 'semantic'];

export function RagSearchBar({ onSearch, busy }: RagSearchBarProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragSearch');
  const [mode, setMode] = useState<SearchMode>('semantic');
  const [query, setQuery] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (query.trim() === '') return;
    onSearch(mode, query.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="flex gap-1 rounded-md border p-0.5">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-2 py-1 text-[10px] font-mono rounded ${
              mode === m ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
            }`}
          >
            {t(`mode.${m}`)}
          </button>
        ))}
      </div>
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('placeholder')}
          className="pl-7"
        />
      </div>
      <Button type="submit" size="sm" disabled={busy || query.trim() === ''}>
        {t('submit')}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2:** `SearchResults.tsx`:

```tsx
'use client';

import type { RagFileRow, SearchResponse, SemanticChunk } from '@/app/lib/ragFiles';
import { useTranslations } from 'next-intl';

interface SearchResultsProps {
  response: SearchResponse | null;
}

export function SearchResults({ response }: SearchResultsProps): React.JSX.Element | null {
  const t = useTranslations('knowledgeBase.ragSearch');
  if (response === null) return null;

  if (response.mode === 'name') {
    const files: RagFileRow[] = response.files ?? [];
    if (files.length === 0) return <span className="text-xs text-muted-foreground">{t('empty')}</span>;
    return (
      <div className="flex flex-col gap-1">
        {files.map((f) => (
          <div key={f.id} className="rounded-md border px-3 py-2 text-xs">
            {f.filename}
          </div>
        ))}
      </div>
    );
  }

  const chunks: SemanticChunk[] = response.chunks ?? [];
  if (chunks.length === 0) return <span className="text-xs text-muted-foreground">{t('empty')}</span>;
  return (
    <div className="flex flex-col gap-2">
      {chunks.map((c) => (
        <div key={c.id} className="rounded-md border p-3 text-xs">
          <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground mb-1">
            <span>{t('page', { page: c.page_number ?? 0 })}</span>
            <span>·</span>
            <span>{t('paragraph', { idx: c.paragraph_idx ?? 0 })}</span>
            {'distance' in c && (
              <>
                <span>·</span>
                <span>{t('distance', { d: c.distance.toFixed(3) })}</span>
              </>
            )}
          </div>
          <p className="whitespace-pre-wrap">{c.content}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3:** Commit:

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/rag/\[storeSlug\]/RagSearchBar.tsx \
        packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/rag/\[storeSlug\]/SearchResults.tsx
git commit -m "feat(web): RAG search bar and results"
```

---

## Task 31: New `RagTenantContent` + wire into `RagStorePageClient`

**Files:**
- Create: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagTenantContent.tsx`
- Modify: `packages/web/app/orgs/[slug]/(dashboard)/knowledge-base/rag/[storeSlug]/RagStorePageClient.tsx`

- [ ] **Step 1:** Create the new `RagTenantContent.tsx`:

```tsx
'use client';

import { listFilesAction, searchAction } from '@/app/actions/ragFiles';
import type { RagFileRow, SearchMode, SearchResponse, TenantUsage } from '@/app/lib/ragFiles';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { FileChunksDrawer } from './FileChunksDrawer';
import { FileRow } from './FileRow';
import { FileUploadDropzone } from './FileUploadDropzone';
import { RagSearchBar } from './RagSearchBar';
import { SearchResults } from './SearchResults';
import { useRagUpload } from './useRagUpload';

interface RagTenantContentProps {
  storeId: string;
  tenantId: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function RagTenantContent({ storeId, tenantId }: RagTenantContentProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragFiles');
  const [files, setFiles] = useState<RagFileRow[]>([]);
  const [usage, setUsage] = useState<TenantUsage>({ files_count: 0, pages_count: 0, bytes_total: 0 });
  const [openChunksFor, setOpenChunksFor] = useState<RagFileRow | null>(null);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);

  const refresh = useCallback(async () => {
    const { result } = await listFilesAction(storeId, tenantId);
    setFiles(result.files);
    setUsage(result.usage);
  }, [storeId, tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const { uploading, uploadFiles } = useRagUpload({
    storeId,
    tenantId,
    onFileQueued: () => { void refresh(); },
  });

  async function handleSearch(mode: SearchMode, query: string): Promise<void> {
    setSearching(true);
    const { result } = await searchAction(storeId, tenantId, mode, query);
    setSearchResponse(result);
    setSearching(false);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-mono text-muted-foreground">
          {t('summary', {
            files: usage.files_count,
            pages: usage.pages_count,
            bytes: formatBytes(usage.bytes_total),
          })}
        </span>
      </div>
      <FileUploadDropzone uploading={uploading} onFiles={(fs) => void uploadFiles(fs)} />
      <RagSearchBar busy={searching} onSearch={(m, q) => void handleSearch(m, q)} />
      {searchResponse !== null && <SearchResults response={searchResponse} />}
      <div className="flex flex-col gap-1.5">
        {files.map((f) => (
          <FileRow
            key={f.id}
            storeId={storeId}
            file={f}
            onOpenChunks={setOpenChunksFor}
            onDeleted={() => void refresh()}
            onStatusReachedDone={() => void refresh()}
          />
        ))}
      </div>
      <FileChunksDrawer
        storeId={storeId}
        file={openChunksFor}
        onOpenChange={(o) => { if (!o) setOpenChunksFor(null); }}
      />
    </div>
  );
}
```

- [ ] **Step 2:** Modify `RagStorePageClient.tsx` to use the new component. Read the file first; replace the inline `RagTenantContent` definition and the `renderTab` call.

Current shape (paraphrased):
```tsx
function RagTenantContent(): React.JSX.Element { ... old client-side queue code ... }
...
renderTab={() => <RagTenantContent />}
```

Replace with:
```tsx
import { RagTenantContent } from './RagTenantContent';

// ...remove the local function definition...

renderTab={(tenantId) => <RagTenantContent storeId={store.id} tenantId={tenantId} />}
```

Also: the `TenantTabs.renderTab` currently has signature `() => ReactNode` (after the earlier removal of the unused `tenantId` param in Task 24 of the multi-store plan). Confirm by reading `TenantTabs.tsx`. If `renderTab: (tenantId: string) => ...`, this works directly. Otherwise, update `TenantTabs` to pass `tenantId` to `renderTab` — its internal `tenants[].id` and `active` state already track it, so the change is one line in `TenantTabs.tsx`:

```tsx
{tenant.id === active ? renderTab(tenant.id) : null}
```

Update the prop type too:
```ts
renderTab: (tenantId: string) => React.ReactNode;
```

- [ ] **Step 3:** Typecheck:

```bash
npm run typecheck -w packages/web
```

- [ ] **Step 4:** Commit:

```bash
git add packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/rag/\[storeSlug\]/RagTenantContent.tsx \
        packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/rag/\[storeSlug\]/RagStorePageClient.tsx \
        packages/web/app/orgs/\[slug\]/\(dashboard\)/knowledge-base/TenantTabs.tsx
git commit -m "feat(web): wire new RagTenantContent into RAG store detail page"
```

---

# Phase 7 — i18n + verify

## Task 32: i18n updates

**Files:**
- Modify: `packages/web/messages/en.json`

- [ ] **Step 1:** Add new keys to the `knowledgeBase` block. Locate `"knowledgeBase": { ... }` and add inside it (sibling to existing keys):

```json
"ragUpload": {
  "idle": "Drag files here or click to upload",
  "drop": "Release to upload",
  "uploading": "Uploading…",
  "addFiles": "Choose files"
},
"ragStatus": {
  "pending": "queued",
  "uploading": "uploading",
  "parsing": "parsing",
  "chunking": "chunking",
  "embedding": "embedding",
  "done": "ready",
  "failed": "failed"
},
"ragFiles": {
  "summary": "{files} files · {pages} pages · {bytes}",
  "pageCount": "{count, plural, =1 {1 page} other {# pages}}",
  "openChunks": "Open chunks",
  "remove": "Remove",
  "deleteTitle": "Delete file?",
  "deleteDescription": "Removes the file and all derived chunks. This cannot be undone.",
  "deleteConfirm": "Delete",
  "deleteCancel": "Cancel"
},
"ragChunks": {
  "loading": "Loading chunks…",
  "page": "p.{page}",
  "paragraph": "¶{idx}",
  "tokens": "{count} tok",
  "prev": "Previous",
  "next": "Next"
},
"ragSearch": {
  "placeholder": "Search this knowledge base…",
  "submit": "Search",
  "empty": "No matches.",
  "mode": {
    "name": "Name",
    "content": "Content",
    "semantic": "Semantic"
  },
  "page": "p.{page}",
  "paragraph": "¶{idx}",
  "distance": "d={d}"
}
```

- [ ] **Step 2:** Validate:

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/web/messages/en.json','utf8')); console.log('ok')"
```

- [ ] **Step 3:** Commit:

```bash
git add packages/web/messages/en.json
git commit -m "i18n(web): rag pipeline translations"
```

---

## Task 33: Full check + smoke test instructions

- [ ] **Step 1:** Run:

```bash
npm run check
npm run test -w packages/backend
```

Both must pass.

- [ ] **Step 2:** Smoke test instructions for the user — paste these in the final summary:

1. Provision GCP per `docs/superpowers/specs/2026-05-11-rag-pipeline-design.md` § "GCP setup checklist".
2. Set env vars in `packages/backend/.env`.
3. Apply both new migrations (`20260511120000_knowledge_base_stores.sql` and `20260511130000_rag_pipeline.sql`) to Supabase.
4. Start backend + web. Backend boot log should print `[startup] RAG pipeline config ok` and `[ragWorker] started`.
5. In the UI: create a RAG store, switch to a tenant tab, drag a small PDF onto the dropzone.
6. Watch the status pill cycle `parsing → chunking → embedding → ready` over a couple of minutes.
7. Click the chevron to open chunks; verify each chunk shows `p.N` and `¶K` audit badges.
8. In the search bar, try Semantic mode with a phrase from the doc; verify it returns relevant chunks ordered by distance.
9. Delete the file; verify the row disappears and (in GCS console) the object + parsed prefix are gone.

---

## Self-review

**Spec coverage**

| Spec § | Plan task(s) |
|---|---|
| pgvector extension + tables + RLS | 1, 9 (RPC) |
| Backend deps | 2 |
| GCP config + startup validation | 3 |
| GCS wrapper | 4 |
| Document AI batch wrapper | 5 |
| Chunker (audit metadata) | 6 |
| Gemini embeddings (batched + RPM) | 7 |
| ragFiles / ragChunks queries | 8, 9 |
| Usage aggregates | 10 |
| Worker state machine | 11 |
| Worker boot wiring | 12 |
| Route helpers | 13 |
| Init upload (signed URL) | 14 |
| Confirm upload (start parsing) | 15 |
| List files / get file / usage | 16 |
| Get chunks | 17 |
| Delete file (GCS + DB) | 18 |
| Search (3 modes) | 19 |
| SSE backend stream | 20 |
| Router mount | 21 |
| Web lib fetchers | 22 |
| Web server actions | 23 |
| Next.js SSE proxy | 24 |
| Upload hook | 25 |
| Dropzone | 26 |
| Live status stream | 27 |
| File row | 28 |
| Chunks drawer | 29 |
| Search bar + results | 30 |
| Tenant content wire-up | 31 |
| i18n | 32 |
| Verify | 33 |

All 11 requirements from the spec map to at least one task. Audit metadata (file/page/paragraph) lives on every `rag_chunks` row (Task 1 + Task 6 + Task 28 + Task 29 + Task 30).

**Placeholder scan:** none.

**Type consistency:**
- `RagFileRow` shape identical between backend (`ragFilesQueries.ts`) and web (`ragFiles.ts` lib).
- `SourcedChunk` columns match `rag_chunks` columns and `insertChunks`'s mapping (Task 9 step 1).
- `SearchMode` is a literal union shared by spec, backend handler (Task 19), web lib (Task 22), and bar (Task 30).
- `RagFileStatus` literal union is consistent across backend queries, web lib, and SSE handler.
