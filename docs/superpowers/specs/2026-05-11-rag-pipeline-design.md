# RAG Pipeline — Design

**Date:** 2026-05-11
**Status:** Design approved (pending written-spec review)
**Builds on:** `2026-05-11-knowledge-base-multi-stores-design.md`

## Problem

A `rag_stores` entity already exists per the multi-store design. Today it's an empty container — uploaded files are queued client-side and never persisted. We need a full RAG pipeline so a tenant can upload files into a `rag_store`, get them parsed/chunked/embedded, and let agents semantically search the result. Tenant isolation is enforced at the chunk level — a chunk belongs to one `(store, tenant)` partition.

## Decisions (already chosen)

- **Storage:** Google Cloud Storage (GCS) only. Upload directly from the browser via short-lived signed URLs. Document AI consumes from the same bucket.
- **Progress UX:** Server-Sent Events from a Next.js route handler that proxies to a backend SSE endpoint.
- **GCP infra:** User provisions. Spec includes a checklist of what to create + env vars. No `gcloud` commands run by Claude.
- **Rollout:** All-in-one branch covering the whole pipeline.
- **Chunking:** Use Document AI Layout Parser's chunk-shaped output directly. Drop micro-chunks below a min-char threshold. Only split a chunk further if it exceeds the embedding model's token limit (rare).
- **Supported file types:** `pdf`, `docx`, `pptx`, `xlsx`, `html`, `jpg`, `jpeg`, `png`. Document AI Layout Parser handles the first five natively. For images (`jpg`/`jpeg`/`png`), the worker wraps each upload in a 1-page PDF via [`pdf-lib`](https://pdf-lib.js.org/) and submits the derived PDF to Document AI — single code path, same audit metadata (image becomes page 1 with OCR'd paragraphs).

## Goals

1. Tenant uploads a file → it lands in GCS, then is parsed, chunked, embedded, and stored.
2. Per-`(store, tenant)` isolation throughout — chunks of tenant A are never returned in a query for tenant B.
3. Real-time progress in the UI: `uploading → parsing → chunking → embedding → done` (or `failed`).
4. Every chunk is auditable: source file, page number, paragraph index, char offsets within the file.
5. UI lists files per tenant with metadata (page count, size, status, timestamp), lets the user delete (cleans storage + DB), and supports three search modes: by name, by content, and semantic.
6. Per-org and per-tenant aggregates: file count, total pages.

## Non-goals (v1)

- Re-embedding after model upgrade (manual re-run is fine).
- Document re-parsing on a corrupt parse (manual delete + re-upload).
- Concurrent edits to a chunk (chunks are read-only after creation).
- Cross-store search (search is always scoped to one store).
- File preview (raw rendering of PDF/etc. in the UI). Show metadata only.

## Architecture overview

```
┌────────────┐   1. POST init      ┌─────────────────┐
│  Browser   │ ──────────────────→ │  Next.js (web)  │
└────────────┘                      │   proxy + auth  │
      │                             └─────────┬───────┘
      │                                       │ 2. fetchFromBackend
      │                                       ▼
      │                              ┌────────────────────┐
      │                              │ Backend (express)  │
      │                              │ - mints signed URL │
      │                              │ - inserts rag_file │
      │                              └────────┬───────────┘
      │ 3. PUT file (signed URL)              │
      │ ────────────────────────────►  GCS    │
      │                                       │ 4. POST /start
      │                                       ▼
      │                              ┌────────────────────┐
      │                              │  ragWorker         │
      │                              │  poll rag_files    │
      │                              │  drive state machine
      │                              └────────┬───────────┘
      │                                       │
      │ 5. SSE updates                        │ submits Document AI batch
      │ ◄──────────  Next.js SSE  ◄── backend │ polls operation
      │                                       │ reads output JSON from GCS
      │                                       │ writes rag_chunks
      │                                       │ embeds in batches → vectors
      │                                       ▼
      │                               postgres + pgvector
```

## Data model

### New extension and tables (one migration)

```sql
-- pgvector for similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Per-file metadata.
CREATE TABLE public.rag_files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_store_id  uuid NOT NULL REFERENCES public.rag_stores(id) ON DELETE CASCADE,
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    bigint NOT NULL,
  page_count    integer,            -- known after parsing
  status        text NOT NULL DEFAULT 'pending',
  status_error  text,                -- non-null when status = 'failed'
  gcs_object    text NOT NULL,       -- e.g. orgs/<orgId>/tenants/<tenantId>/stores/<storeId>/<fileId>/<safeName>
  da_operation  text,                -- Document AI batch operation name
  parsed_uri    text,                -- gs:// URI of Document AI's output prefix
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rag_files_status_valid
    CHECK (status IN ('pending','uploading','parsing','chunking','embedding','done','failed'))
);
CREATE INDEX idx_rag_files_store_tenant   ON public.rag_files(rag_store_id, tenant_id);
CREATE INDEX idx_rag_files_status         ON public.rag_files(status) WHERE status NOT IN ('done','failed');

-- Per-chunk with embedding. tenant_id and rag_store_id are denormalized
-- here to make tenant-isolated queries fast and RLS straightforward.
CREATE TABLE public.rag_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rag_file_id     uuid NOT NULL REFERENCES public.rag_files(id) ON DELETE CASCADE,
  rag_store_id   uuid NOT NULL REFERENCES public.rag_stores(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id)    ON DELETE CASCADE,
  page_number    integer,
  paragraph_idx  integer,            -- index of the source paragraph on that page (audit)
  char_start     integer,            -- offset within the file's extracted text
  char_end       integer,
  content        text NOT NULL,
  content_hash   text NOT NULL,      -- sha256 of content, for dedup detection
  token_count    integer,
  embedding      vector(768),        -- Gemini text-embedding-004
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rag_chunks_file              ON public.rag_chunks(rag_file_id);
CREATE INDEX idx_rag_chunks_store_tenant      ON public.rag_chunks(rag_store_id, tenant_id);
-- HNSW on cosine distance is the modern, no-training-needed pgvector index.
CREATE INDEX idx_rag_chunks_embedding_cosine  ON public.rag_chunks
  USING hnsw (embedding vector_cosine_ops);
-- Full-text search on content for the "content" search mode (faster than ILIKE).
CREATE INDEX idx_rag_chunks_content_fts       ON public.rag_chunks
  USING gin (to_tsvector('simple', content));
```

**RLS.** Both tables enable RLS; SELECT/INSERT/UPDATE/DELETE policies use `is_org_member(org_id)` for `rag_files`; for `rag_chunks` we add a `SECURITY DEFINER` helper `rag_file_org_id(rag_file_id uuid) returns uuid` to avoid recursive subquery RLS issues (mirrors the `kv_store_org_id` helper from the multi-store spec).

**Note on slug/agents/etc.:** existing tables untouched.

## Status machine

Each `rag_files` row walks a finite state graph driven by the worker:

```
pending → uploading → parsing → chunking → embedding → done
                ↓        ↓         ↓           ↓
              failed   failed    failed      failed
```

- `pending`: row created, awaiting signed-URL upload completion.
- `uploading`: signed URL issued; transient state. Client confirms upload via `POST /files/:id/start` which advances to `parsing`.
- `parsing`: Document AI batch job in flight. `da_operation` column holds the operation name.
- `chunking`: parse complete; worker is iterating Document AI's output JSON in GCS and writing `rag_chunks` rows (without embeddings yet).
- `embedding`: chunks written; worker is batching them through Gemini and updating `embedding` cells.
- `done`: complete.
- `failed`: at any step, set `status='failed'` and `status_error=<message>`.

## Backend

### New deps

```jsonc
"dependencies": {
  "@google-cloud/documentai": "^9.0.0",
  "@google-cloud/storage":    "^7.0.0",
  "@ai-sdk/google":           "^1.0.0",   // already exists? confirm
  "ai":                       "^4.0.0",   // for embedMany; confirm version
  "pdf-lib":                  "^1.17.0"   // wrap images into single-page PDFs
}
```

The `embedMany` pattern mirrors the reference at `closer-back/src/ai/actions/getSeveralEmbeddings/index.ts` (batch size 20, rate-limited, batched progress).

### Module layout

```
packages/backend/src/
├── rag/
│   ├── config.ts                  reads env vars (GCP_PROJECT_ID, GCP_LOCATION,
│   │                              DOCUMENTAI_PROCESSOR_ID, GCS_BUCKET,
│   │                              GOOGLE_APPLICATION_CREDENTIALS path)
│   ├── gcs.ts                     signed-URL minting, GCS read/write, delete
│   ├── documentAi.ts              submit batch job, fetch operation, list output blobs
│   ├── imagePdf.ts                wraps jpg/jpeg/png into a 1-page PDF via pdf-lib
│   ├── chunker.ts                 parse Document AI JSON → SourcedChunk[]
│   │                              (preserves page/paragraph/char offsets)
│   ├── embeddings.ts              Gemini embedMany wrapper, batch + rate limit
│   ├── search.ts                  name / content (FTS) / semantic search functions
│   └── workerLoop.ts              picks up rag_files rows and advances them
├── workers/
│   └── ragWorker.ts               thin entrypoint that imports rag/workerLoop
├── db/queries/
│   ├── ragFilesQueries.ts         CRUD + status transitions, used by routes+worker
│   ├── ragChunksQueries.ts        bulk insert chunks, vector search, FTS search
│   └── ragUsageQueries.ts         per-org / per-tenant aggregates
└── routes/ragStores/
    ├── ragFilesRouter.ts          mounts the new endpoints under /rag-stores/:storeId/files
    ├── initUpload.ts              creates rag_files row + returns signed URL
    ├── confirmUpload.ts           advances pending → parsing, kicks worker
    ├── listFiles.ts               GET files for (storeId, tenantId)
    ├── getFileDetail.ts           GET rag_file + its chunks (paginated)
    ├── deleteFile.ts              delete chunks + file row + GCS object
    ├── streamFileStatus.ts        SSE: emits status updates while file is in flight
    └── search.ts                  POST search { mode, query, tenantId, k }
```

### Endpoints (mounted under existing `/rag-stores` router; new path tree)

```
POST   /rag-stores/:storeId/files/init        body: { tenantId, filename, mimeType, sizeBytes }
                                              → { fileId, uploadUrl, gcsObject }
POST   /rag-stores/:storeId/files/:id/start   client signals upload done; transitions pending→parsing
GET    /rag-stores/:storeId/files             ?tenantId=...  → RagFile[]
GET    /rag-stores/:storeId/files/:id         → RagFile (with metadata + page count)
GET    /rag-stores/:storeId/files/:id/chunks  ?page=&pageSize=  → ChunkSummary[]
GET    /rag-stores/:storeId/files/:id/stream  SSE: { status, error? } updates
DELETE /rag-stores/:storeId/files/:id         deletes chunks + row + GCS object
POST   /rag-stores/:storeId/search            body: { tenantId, mode, query, k }
                                              mode: 'name' | 'content' | 'semantic'
```

### Worker loop (`workerLoop.ts`)

```
every POLL_INTERVAL_MS:
  claim up to BATCH_SIZE rag_files rows where status IN ('parsing','chunking','embedding')
    or (status='pending' AND da_operation IS NOT NULL)  -- defensive
  for each row, dispatch on status:
    parsing   → check Document AI op; if done → set status='chunking' + parsed_uri
                                     ; if errored → status='failed'
    chunking  → read all output JSON blobs from parsed_uri, derive chunks,
                bulk insert rag_chunks (embedding=NULL), set status='embedding'
                + update page_count
    embedding → fetch rag_chunks where embedding IS NULL AND rag_file_id=$file
                in batches of 20, call Gemini embedMany, update vectors
                when none remain → status='done'
    failed/done → skip (shouldn't be claimed)
```

Single worker process. POLL_INTERVAL_MS = 5000.

Locking: `SELECT ... FOR UPDATE SKIP LOCKED` on claim.

### SSE endpoint (`streamFileStatus.ts`)

Polls the file row every 1 second; emits an event when `status` or `status_error` changes. Closes the stream when status is `done` or `failed`.

### Document AI specifics

- Use Layout Parser processor. Configure `processOptions.layoutConfig.chunkingConfig` with `chunkSize: 500` and `includeAncestorHeadings: true`.
- Batch input: single GCS URI per job (one file per job — simpler than mixing tenants).
- Batch output: a folder in GCS like `gs://<bucket>/parsed/<fileId>/`. The job writes JSON shards. We read all of them.
- Output JSON structure: `chunkedDocument.chunks[]` each with `chunkId`, `content`, `pageHeaders[]`, `pageFooters[]`, `pageSpan` (start/end page). We map these to `rag_chunks` rows.

### Embeddings

`embedMany` from the `ai` package with `@ai-sdk/google`'s `textEmbeddingModel('text-embedding-004')`. Batch size 20. Rate-limited via a simple in-process token bucket (Gemini's free tier is 15 req/min; paid is much higher — we'll use a configurable `EMBEDDINGS_RPM` env var, default 60).

Token-count estimate: chars / 4. Used to size-check chunks before sending.

## Frontend

### Where it lives

Inside the existing tenant-tab for a RAG store (`rag/[storeSlug]/page.tsx → RagStorePageClient → RagTenantContent`). Today `RagTenantContent` shows a client-side file queue with no persistence. We replace it.

### New components

```
knowledge-base/rag/[storeSlug]/
├── RagStorePageClient.tsx              (existing — pass tenantId now)
├── RagTenantContent.tsx                rewrite: shows file table + upload + search
├── FileUploadDropzone.tsx              drag/drop + click. Hands files to useRagUpload.
├── useRagUpload.ts                     hook: init → PUT to signed URL → start
├── FileRow.tsx                         one row per file: name, size, pages, status pill,
│                                       progress bar, expand button, delete button
├── FileStatusStream.tsx                opens SSE, renders the active step
├── FileChunksDrawer.tsx                slide-in panel: paginated chunks with metadata
│                                       (page, paragraph) + embedding preview (first 8 dims)
├── RagSearchBar.tsx                    mode toggle (name / content / semantic) + input
└── SearchResults.tsx                   results list keyed by file + chunk

(plus translations)
```

### Upload flow (`useRagUpload.ts`)

```
1. POST /rag-files/init → { fileId, uploadUrl }
2. PUT file → uploadUrl  (browser → GCS direct)
3. POST /rag-files/:id/start
4. Open SSE on /rag-files/:id/stream
5. As statuses arrive, update local state; close SSE when done/failed
```

### Status pill

`uploading | parsing | chunking | embedding | done | failed` — each gets a color + a short copy ("Parsing layout", "Generating embeddings", etc.).

### Chunks drawer

Two tabs: **Chunks** and **Embeddings preview**. Chunks tab shows a list; each item is one chunk with its content (truncated, click-to-expand), source page/paragraph badge, and char range. Embeddings tab shows the first 8 dimensions of the vector for that chunk as a sparkline + dim count.

### Search bar

Single input + a small segmented control: **Name | Content | Semantic**. Submit triggers the corresponding mode. Results show inline below, scoped to the current tenant tab.

## Tenant isolation

- Every `rag_chunks` row carries `tenant_id` (denormalized).
- All queries — listing, retrieval, search — filter on `(rag_store_id, tenant_id)`.
- RLS adds defense in depth via `is_org_member(org_id)`.
- The agents runtime (a future consumer) will pass tenant context and call `searchRagChunks(storeId, tenantId, query)`. We never lookup by store alone.

## Aggregate counts

A SQL view `rag_usage_by_tenant` and `rag_usage_by_org`:

```sql
CREATE VIEW public.rag_usage_by_tenant AS
SELECT org_id, tenant_id, rag_store_id,
       count(*) FILTER (WHERE status = 'done') AS files_count,
       coalesce(sum(page_count) FILTER (WHERE status = 'done'), 0) AS pages_count,
       coalesce(sum(size_bytes), 0)                      AS bytes_total
FROM public.rag_files
GROUP BY org_id, tenant_id, rag_store_id;

CREATE VIEW public.rag_usage_by_org AS
SELECT org_id,
       count(*) FILTER (WHERE status = 'done') AS files_count,
       coalesce(sum(page_count) FILTER (WHERE status = 'done'), 0) AS pages_count,
       coalesce(sum(size_bytes), 0)                      AS bytes_total
FROM public.rag_files
GROUP BY org_id;
```

The UI shows the per-tenant aggregate at the top of the file list ("3 files · 47 pages · 8.2 MB").

## Search modes

- **Name** (`mode: 'name'`): `ILIKE '%query%'` on `rag_files.filename` within `(store, tenant)`. Returns matching files (not chunks).
- **Content** (`mode: 'content'`): Postgres FTS via `to_tsvector('simple', content) @@ plainto_tsquery('simple', query)` on `rag_chunks`. Returns chunks ranked by `ts_rank`.
- **Semantic** (`mode: 'semantic'`): embed the query (single call to Gemini), then `SELECT … ORDER BY embedding <=> $query LIMIT k`. Returns chunks ranked by cosine distance.

Default `k = 20`.

## Delete behavior

`DELETE /rag-files/:id`:
1. Verify caller has access to the org.
2. Delete the GCS object (best-effort; log on failure).
3. If `mime_type` starts with `image/`, also delete the derived `<gcs_object>.pdf` Document AI input (best-effort).
4. Delete the Document AI output prefix (best-effort).
5. `DELETE FROM rag_files WHERE id=$1` — cascades to `rag_chunks`.

If a delete arrives while parsing/embedding is in flight, the worker's next iteration sees a missing row and aborts gracefully.

## GCP setup checklist (for the user)

Set up before running any of this code:

1. **Create or pick a GCP project.** Note the project ID.
2. **Enable APIs**: Document AI API, Cloud Storage API, Generative Language API (for Gemini embeddings) — or Vertex AI API if you want to use Vertex.
3. **Create a Document AI Layout Parser processor** in a supported location (e.g. `us`). Note the processor ID.
4. **Create a GCS bucket** for the uploads + parsed output (one bucket is fine; use prefixes `uploads/` and `parsed/`). Use `us` location for cheaper egress with Document AI in the same region.
5. **Create a service account** with roles:
   - `Document AI API User`
   - `Storage Object Admin` (scoped to the bucket above)
   - `Generative AI User` (or equivalent for Gemini embeddings)
6. **Download the service-account JSON key**, save to a safe path locally / mount as a secret in deploys.
7. **Set env vars** in `packages/backend/.env` and your deployment secrets:
   ```
   GCP_PROJECT_ID=<project-id>
   GCP_LOCATION=us
   DOCUMENTAI_PROCESSOR_ID=<processor-id>
   GCS_BUCKET=<bucket-name>
   GOOGLE_APPLICATION_CREDENTIALS=<path to JSON>
   EMBEDDINGS_RPM=60
   ```
8. **CORS on the GCS bucket** — allow `PUT` from the web origin(s):
   ```json
   [
     {
       "origin": ["http://localhost:3101", "<prod origin>"],
       "method": ["PUT"],
       "responseHeader": ["Content-Type"],
       "maxAgeSeconds": 3600
     }
   ]
   ```
   Apply with `gsutil cors set cors.json gs://<bucket>` or via Console.

The backend boot-time `startupChecks` will validate these env vars are present and that the service-account file is readable; it'll log a warning (not crash) if missing so dev environments without GCP can still run other features.

## Risks and notes

- **Cost.** Document AI Layout Parser is ~$10/1000 pages; Gemini embeddings are ~$0.025/1M tokens. We don't expose these in the UI for v1.
- **Concurrency.** One worker process; if you scale to N workers the `SELECT ... FOR UPDATE SKIP LOCKED` pattern handles claims safely. For v1 single-process is fine.
- **Embedding model lock-in.** `embedding vector(768)` is sized for `text-embedding-004`. Switching to a different-dim model would require a column change + re-embedding. Out of scope for v1.
- **Large files.** Document AI batch can handle up to 200 MB / 500 pages per file. We reject anything larger client-side and at `init`.
- **PII / privacy.** Files sit in GCS until deleted. If the org deletes a tenant, cascade deletes drop chunks but not the GCS object. Add a cleanup task only when we add an org-deletion flow.
- **Re-uploads / dedup.** Same `content_hash` chunk across two files is allowed — agents may want both citations. No global dedup.

## Out of scope (for follow-up)

- Reprocessing on model upgrade.
- Hybrid search (FTS + semantic re-rank).
- Citation rendering with bounding boxes.
- File-level versioning.
- Cross-store federated search.
- An admin UI for force-restarting a failed file.

## Open questions

None blocking.
