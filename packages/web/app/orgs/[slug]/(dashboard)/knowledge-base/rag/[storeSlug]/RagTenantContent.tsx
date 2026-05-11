'use client';

import { listFilesAction, searchAction } from '@/app/actions/ragFiles';
import type { RagFileRow, SearchMode, SearchResponse, TenantUsage } from '@/app/lib/ragFiles';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Scrollable } from '@/app/components/Scrollable';
import { Loader2 } from 'lucide-react';

import { FileRow } from './FileRow';
import { FileUploadDropzone } from './FileUploadDropzone';
import { RagSearchBar } from './RagSearchBar';
import { SearchResults } from './SearchResults';
import { UploadFilesButton } from './UploadFilesButton';
import { useRagUpload } from './useRagUpload';

interface RagTenantContentProps {
  storeId: string;
  tenantId: string;
}

const BYTES_KB = 1024;
const ONE_DECIMAL = 1;
const ZERO_USAGE: TenantUsage = { files_count: 0, pages_count: 0, bytes_total: 0 };

function formatBytes(n: number): string {
  if (n < BYTES_KB) return `${String(n)} B`;
  const kb = n / BYTES_KB;
  if (kb < BYTES_KB) return `${kb.toFixed(ONE_DECIMAL)} KB`;
  const mb = kb / BYTES_KB;
  return `${mb.toFixed(ONE_DECIMAL)} MB`;
}

interface UseTenantFilesReturn {
  files: RagFileRow[];
  usage: TenantUsage;
  loaded: boolean;
  refresh: () => Promise<void>;
}

interface LoadedFiles {
  key: string;
  files: RagFileRow[];
  usage: TenantUsage;
}

function tenantKey(storeId: string, tenantId: string): string {
  return `${storeId}::${tenantId}`;
}

function useTenantFiles(storeId: string, tenantId: string): UseTenantFilesReturn {
  const [state, setState] = useState<LoadedFiles | null>(null);
  const key = tenantKey(storeId, tenantId);

  const refresh = useCallback(async (): Promise<void> => {
    const { result } = await listFilesAction(storeId, tenantId);
    setState({ key: tenantKey(storeId, tenantId), files: result.files, usage: result.usage });
  }, [storeId, tenantId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { result } = await listFilesAction(storeId, tenantId);
      if (cancelled) return;
      setState({ key: tenantKey(storeId, tenantId), files: result.files, usage: result.usage });
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, tenantId]);

  const ready = state !== null && state.key === key;
  return {
    files: ready ? state.files : [],
    usage: ready ? state.usage : ZERO_USAGE,
    loaded: ready,
    refresh,
  };
}

interface UseTenantSearchReturn {
  response: SearchResponse | null;
  busy: boolean;
  run: (mode: SearchMode, query: string) => Promise<void>;
}

function useTenantSearch(storeId: string, tenantId: string): UseTenantSearchReturn {
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (mode: SearchMode, query: string): Promise<void> => {
      setBusy(true);
      const { result } = await searchAction(storeId, tenantId, mode, query);
      setResponse(result);
      setBusy(false);
    },
    [storeId, tenantId]
  );

  return { response, busy, run };
}

interface FileListProps {
  storeId: string;
  files: RagFileRow[];
  onRefresh: () => void;
}

function FileList({ storeId, files, onRefresh }: FileListProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      {files.map((f) => (
        <FileRow
          key={f.id}
          storeId={storeId}
          file={f}
          onDeleted={onRefresh}
          onStatusReachedDone={onRefresh}
        />
      ))}
    </div>
  );
}

interface UsageSummaryProps {
  usage: TenantUsage;
}

function UsageSummary({ usage }: UsageSummaryProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragFiles');
  return (
    <span className="text-[11px] font-mono text-muted-foreground">
      {t('summary', {
        files: usage.files_count,
        pages: usage.pages_count,
        bytes: formatBytes(usage.bytes_total),
      })}
    </span>
  );
}

function LoadingSpinner(): React.JSX.Element {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-blue-500" />
    </div>
  );
}

// TODO: remove — temporary mock files to preview FileTypeIcon variants and scrolling.
interface MockTemplate {
  filename: string;
  mime_type: string;
}

const MOCK_TEMPLATES: MockTemplate[] = [
  { filename: 'q3-report.pdf',                 mime_type: 'application/pdf' },
  { filename: 'meeting-notes.docx',            mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { filename: 'budget-2026.xlsx',              mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { filename: 'kickoff-slides.pptx',           mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { filename: 'changelog.html',                mime_type: 'text/html' },
  { filename: 'whiteboard.jpg',                mime_type: 'image/jpeg' },
  { filename: 'logo.png',                      mime_type: 'image/png' },
  { filename: 'mystery-blob',                  mime_type: 'application/octet-stream' },
  { filename: 'roadmap-2026.pdf',              mime_type: 'application/pdf' },
  { filename: 'employee-handbook.pdf',         mime_type: 'application/pdf' },
  { filename: 'product-specs.docx',            mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { filename: 'expenses-q1.xlsx',              mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { filename: 'sales-pipeline.xlsx',           mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { filename: 'all-hands.pptx',                mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { filename: 'investor-deck.pptx',            mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { filename: 'docs-index.html',               mime_type: 'text/html' },
  { filename: 'release-notes.html',            mime_type: 'text/html' },
  { filename: 'team-photo.jpeg',               mime_type: 'image/jpeg' },
  { filename: 'architecture-diagram.png',      mime_type: 'image/png' },
  { filename: 'banner.png',                    mime_type: 'image/png' },
  { filename: 'compliance-checklist.pdf',      mime_type: 'application/pdf' },
  { filename: 'security-audit.pdf',            mime_type: 'application/pdf' },
  { filename: 'onboarding.docx',               mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { filename: 'design-tokens.docx',            mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { filename: 'forecast.xlsx',                 mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { filename: 'qbr-q4.pptx',                   mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { filename: 'snapshot-2026-05.jpg',          mime_type: 'image/jpeg' },
  { filename: 'wireframe.png',                 mime_type: 'image/png' },
  { filename: 'archived-readme.html',          mime_type: 'text/html' },
  { filename: 'random-data',                   mime_type: 'application/octet-stream' },
];

const MOCK_BYTE_BASE = 50_000;
const MOCK_PAGE_BASE = 3;

function buildMockFiles(storeId: string, tenantId: string): RagFileRow[] {
  const baseCommon = {
    rag_store_id: storeId,
    tenant_id: tenantId,
    org_id: 'mock-org',
    status: 'done' as const,
    status_error: null,
    gcs_object: '',
    da_operation: null,
    parsed_uri: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return MOCK_TEMPLATES.map((tpl, idx) => ({
    ...baseCommon,
    id: `mock-${String(idx)}`,
    filename: tpl.filename,
    mime_type: tpl.mime_type,
    size_bytes: MOCK_BYTE_BASE * (idx + 1),
    page_count: MOCK_PAGE_BASE + (idx % 10),
  }));
}

export function RagTenantContent({ storeId, tenantId }: RagTenantContentProps): React.JSX.Element {
  const { files, usage, loaded, refresh } = useTenantFiles(storeId, tenantId);
  const search = useTenantSearch(storeId, tenantId);

  const { uploading, uploadFiles } = useRagUpload({
    storeId,
    tenantId,
    onFileQueued: () => {
      void refresh();
    },
  });

  // TODO: remove — merging mock files in for icon preview.
  const displayFiles = loaded ? [...buildMockFiles(storeId, tenantId), ...files] : files;
  const hasFiles = displayFiles.length > 0;
  const showEmptyState = loaded && !hasFiles;
  const showSearchBar = loaded && hasFiles;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        {loaded ? <UsageSummary usage={usage} /> : <div />}
        {loaded && (
          <UploadFilesButton uploading={uploading} onFiles={(fs) => void uploadFiles(fs)} />
        )}
      </div>
      {!loaded && <LoadingSpinner />}
      {showEmptyState && (
        <FileUploadDropzone uploading={uploading} onFiles={(fs) => void uploadFiles(fs)} />
      )}
      {showSearchBar && <RagSearchBar busy={search.busy} onSearch={(m, q) => void search.run(m, q)} />}
      {loaded && hasFiles && (
        <Scrollable className="flex-1 min-h-0">
          <div className="flex flex-col gap-4 pr-1">
            {search.response !== null && <SearchResults response={search.response} />}
            <FileList
              storeId={storeId}
              files={displayFiles}
              onRefresh={() => void refresh()}
            />
          </div>
        </Scrollable>
      )}
    </div>
  );
}
