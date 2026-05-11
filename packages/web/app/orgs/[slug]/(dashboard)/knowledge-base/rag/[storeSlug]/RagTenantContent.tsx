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
  refresh: () => Promise<void>;
}

function useTenantFiles(storeId: string, tenantId: string): UseTenantFilesReturn {
  const [files, setFiles] = useState<RagFileRow[]>([]);
  const [usage, setUsage] = useState<TenantUsage>(ZERO_USAGE);

  const refresh = useCallback(async (): Promise<void> => {
    const { result } = await listFilesAction(storeId, tenantId);
    setFiles(result.files);
    setUsage(result.usage);
  }, [storeId, tenantId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { result } = await listFilesAction(storeId, tenantId);
      if (cancelled) return;
      setFiles(result.files);
      setUsage(result.usage);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, tenantId]);

  return { files, usage, refresh };
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
  onOpenChunks: (file: RagFileRow) => void;
  onRefresh: () => void;
}

function FileList({ storeId, files, onOpenChunks, onRefresh }: FileListProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      {files.map((f) => (
        <FileRow
          key={f.id}
          storeId={storeId}
          file={f}
          onOpenChunks={onOpenChunks}
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
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-mono text-muted-foreground">
        {t('summary', {
          files: usage.files_count,
          pages: usage.pages_count,
          bytes: formatBytes(usage.bytes_total),
        })}
      </span>
    </div>
  );
}

export function RagTenantContent({ storeId, tenantId }: RagTenantContentProps): React.JSX.Element {
  const { files, usage, refresh } = useTenantFiles(storeId, tenantId);
  const search = useTenantSearch(storeId, tenantId);
  const [openChunksFor, setOpenChunksFor] = useState<RagFileRow | null>(null);

  const { uploading, uploadFiles } = useRagUpload({
    storeId,
    tenantId,
    onFileQueued: () => {
      void refresh();
    },
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <UsageSummary usage={usage} />
      <FileUploadDropzone uploading={uploading} onFiles={(fs) => void uploadFiles(fs)} />
      <RagSearchBar busy={search.busy} onSearch={(m, q) => void search.run(m, q)} />
      {search.response !== null && <SearchResults response={search.response} />}
      <FileList
        storeId={storeId}
        files={files}
        onOpenChunks={setOpenChunksFor}
        onRefresh={() => void refresh()}
      />
      <FileChunksDrawer
        storeId={storeId}
        file={openChunksFor}
        onOpenChange={(o) => {
          if (!o) setOpenChunksFor(null);
        }}
      />
    </div>
  );
}
