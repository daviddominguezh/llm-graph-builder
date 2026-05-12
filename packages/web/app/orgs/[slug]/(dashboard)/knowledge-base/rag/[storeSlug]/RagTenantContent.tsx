'use client';

import { checkFilesAction, listFilesAction, searchAction } from '@/app/actions/ragFiles';
import { getCachedFiles, setCachedFiles } from '@/app/lib/ragCache';
import type {
  RagChunkRow,
  RagFileRow,
  SearchMode,
  SearchResponse,
  TenantUsage,
} from '@/app/lib/ragFiles';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Scrollable } from '@/app/components/Scrollable';
import { Loader2 } from 'lucide-react';

import { FileRow } from './FileRow';
import { FileUploadDropzone } from './FileUploadDropzone';
import { RagSearchBar } from './RagSearchBar';
import { UploadFilesButton } from './UploadFilesButton';
import { useRagUpload } from './useRagUpload';

interface RagTenantContentProps {
  storeId: string;
  tenantId: string;
}

const BYTES_KB = 1024;
const ONE_DECIMAL = 1;
const SEARCH_DEBOUNCE_MS = 2000;
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
    const { result, error } = await listFilesAction(storeId, tenantId);
    if (error !== null) return;
    setState({ key: tenantKey(storeId, tenantId), files: result.files, usage: result.usage });
    await setCachedFiles(storeId, tenantId, result.files, result.usage, result.digest ?? '');
  }, [storeId, tenantId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await getCachedFiles(storeId, tenantId);
      if (cancelled) return;
      if (cached !== null) {
        setState({ key, files: cached.files, usage: cached.usage });
        const check = await checkFilesAction(storeId, tenantId, cached.digest);
        if (cancelled) return;
        if (check.result !== null && !check.result.changed) return;
      }
      const { result, error } = await listFilesAction(storeId, tenantId);
      if (cancelled || error !== null) return;
      setState({ key, files: result.files, usage: result.usage });
      await setCachedFiles(storeId, tenantId, result.files, result.usage, result.digest ?? '');
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, tenantId, key]);

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
  query: string;
  mode: SearchMode;
  topK: number;
  minSimilarity: number;
  setQuery: (q: string) => void;
  setMode: (m: SearchMode) => void;
  setTopK: (k: number) => void;
  setMinSimilarity: (s: number) => void;
}

interface SettledSearch {
  query: string;
  mode: SearchMode;
  topK: number;
  minSimilarity: number;
  response: SearchResponse;
}

const DEFAULT_TOP_K = 20;
const DEFAULT_MIN_SIMILARITY = 0;

function useTenantSearch(storeId: string, tenantId: string): UseTenantSearchReturn {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('simple');
  const [topK, setTopK] = useState(DEFAULT_TOP_K);
  const [minSimilarity, setMinSimilarity] = useState(DEFAULT_MIN_SIMILARITY);
  const [settled, setSettled] = useState<SettledSearch | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') return;
    let cancelled = false;
    const id = setTimeout(() => {
      void (async () => {
        const { result } = await searchAction(storeId, tenantId, mode, trimmed, {
          topK,
          minSimilarity,
        });
        if (cancelled) return;
        setSettled({ query: trimmed, mode, topK, minSimilarity, response: result });
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [storeId, tenantId, query, mode, topK, minSimilarity]);

  const matchesCurrent =
    settled !== null &&
    settled.query === query.trim() &&
    settled.mode === mode &&
    settled.topK === topK &&
    settled.minSimilarity === minSimilarity;
  const response = matchesCurrent && settled !== null ? settled.response : null;
  return {
    response,
    query,
    mode,
    topK,
    minSimilarity,
    setQuery,
    setMode,
    setTopK,
    setMinSimilarity,
  };
}

interface SearchState {
  visibleFiles: RagFileRow[];
  chunksByFile: Map<string, RagChunkRow[]>;
  isSearchActive: boolean;
  isSearchPending: boolean;
  showNoMatches: boolean;
}

const EMPTY_CHUNKS_MAP: Map<string, RagChunkRow[]> = new Map();

function groupChunksByFile(response: SearchResponse): Map<string, RagChunkRow[]> {
  const map = new Map<string, RagChunkRow[]>();
  for (const c of response.chunks ?? []) {
    const arr = map.get(c.rag_file_id) ?? [];
    arr.push(c);
    map.set(c.rag_file_id, arr);
  }
  return map;
}

function deriveSearchState(files: RagFileRow[], search: UseTenantSearchReturn): SearchState {
  const isSearching = search.query.trim() !== '';
  if (!isSearching)
    return {
      visibleFiles: files,
      chunksByFile: EMPTY_CHUNKS_MAP,
      isSearchActive: false,
      isSearchPending: false,
      showNoMatches: false,
    };
  if (search.response === null)
    return {
      visibleFiles: [],
      chunksByFile: EMPTY_CHUNKS_MAP,
      isSearchActive: true,
      isSearchPending: true,
      showNoMatches: false,
    };
  const chunksByFile = groupChunksByFile(search.response);
  const ids = new Set<string>(chunksByFile.keys());
  for (const f of search.response.files ?? []) ids.add(f.id);
  const visibleFiles = files.filter((f) => ids.has(f.id));
  return {
    visibleFiles,
    chunksByFile,
    isSearchActive: true,
    isSearchPending: false,
    showNoMatches: visibleFiles.length === 0,
  };
}

interface FileListProps {
  storeId: string;
  files: RagFileRow[];
  onRefresh: () => void;
  isSearchActive: boolean;
  chunksByFile: Map<string, RagChunkRow[]>;
}

function FileList({
  storeId,
  files,
  onRefresh,
  isSearchActive,
  chunksByFile,
}: FileListProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      {files.map((f) => (
        <FileRow
          key={f.id}
          storeId={storeId}
          file={f}
          onDeleted={onRefresh}
          onStatusReachedDone={onRefresh}
          forceExpanded={isSearchActive}
          overrideChunks={isSearchActive ? (chunksByFile.get(f.id) ?? []) : undefined}
        />
      ))}
    </div>
  );
}

function UsageSummary({ usage }: { usage: TenantUsage }): React.JSX.Element {
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

function NoMatchesMessage(): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragFiles');
  return (
    <div className="flex flex-1 items-center justify-center">
      <span className="text-xs text-muted-foreground">{t('noMatches')}</span>
    </div>
  );
}

interface FileListSectionProps {
  storeId: string;
  files: RagFileRow[];
  onRefresh: () => void;
  isSearchActive: boolean;
  isSearchPending: boolean;
  showNoMatches: boolean;
  chunksByFile: Map<string, RagChunkRow[]>;
}

function FileListSection({
  storeId,
  files,
  onRefresh,
  isSearchActive,
  isSearchPending,
  showNoMatches,
  chunksByFile,
}: FileListSectionProps): React.JSX.Element {
  if (isSearchPending) return <LoadingSpinner />;
  if (showNoMatches) return <NoMatchesMessage />;
  return (
    <Scrollable className="flex-1 min-h-0">
      <FileList
        storeId={storeId}
        files={files}
        onRefresh={onRefresh}
        isSearchActive={isSearchActive}
        chunksByFile={chunksByFile}
      />
    </Scrollable>
  );
}

interface HeaderRowProps {
  loaded: boolean;
  usage: TenantUsage;
  uploading: boolean;
  onFiles: (files: FileList) => void;
}

function HeaderRow({ loaded, usage, uploading, onFiles }: HeaderRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      {loaded ? <UsageSummary usage={usage} /> : <div />}
      {loaded && <UploadFilesButton uploading={uploading} onFiles={onFiles} />}
    </div>
  );
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

  const { visibleFiles, chunksByFile, isSearchActive, isSearchPending, showNoMatches } =
    deriveSearchState(files, search);
  const hasFiles = files.length > 0;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-4 p-4">
      <HeaderRow loaded={loaded} usage={usage} uploading={uploading} onFiles={(fs) => void uploadFiles(fs)} />
      {!loaded && <LoadingSpinner />}
      {loaded && !hasFiles && (
        <FileUploadDropzone uploading={uploading} onFiles={(fs) => void uploadFiles(fs)} />
      )}
      {loaded && hasFiles && (
        <>
          <RagSearchBar
            query={search.query}
            mode={search.mode}
            topK={search.topK}
            minSimilarity={search.minSimilarity}
            onQueryChange={search.setQuery}
            onModeChange={search.setMode}
            onTopKChange={search.setTopK}
            onMinSimilarityChange={search.setMinSimilarity}
          />
          <FileListSection
            storeId={storeId}
            files={visibleFiles}
            onRefresh={() => void refresh()}
            isSearchActive={isSearchActive}
            isSearchPending={isSearchPending}
            showNoMatches={showNoMatches}
            chunksByFile={chunksByFile}
          />
        </>
      )}
    </div>
  );
}
