'use client';

import { checkFilesAction, listFilesAction, searchAction } from '@/app/actions/ragFiles';
import { getCachedFiles, setCachedFiles } from '@/app/lib/ragCache';
import type {
  RagFileRow,
  SearchMode,
  SearchResponse,
  SemanticChunk,
  TenantUsage,
} from '@/app/lib/ragFiles';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Scrollable } from '@/app/components/Scrollable';
import { Loader2 } from 'lucide-react';

import { FileRow } from './FileRow';
import { FileUploadDropzone } from './FileUploadDropzone';
import { PageDragOverlay, usePageDrag } from './PageDragOverlay';
import { RagSearchBar } from './RagSearchBar';
import { StagedFilesDialog, useStagedUpload } from './StagedFilesDialog';
import { UploadFilesButton } from './UploadFilesButton';
import { useStagedFiles } from './useStagedFiles';

interface RagTenantContentProps {
  storeId: string;
  tenantId: string;
}

const BYTES_KB = 1024;
const ONE_DECIMAL = 1;
const ZERO_USAGE: TenantUsage = { files_count: 0, pages_count: 0, bytes_total: 0 };
const NO_FILES = 0;

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
  rerank: boolean;
  submittedQuery: string;
  isPending: boolean;
  setQuery: (q: string) => void;
  setMode: (m: SearchMode) => void;
  setTopK: (k: number) => void;
  setMinSimilarity: (s: number) => void;
  setRerank: (enabled: boolean) => void;
  submit: () => void;
  clear: () => void;
}

const DEFAULT_TOP_K = 5;
const DEFAULT_MIN_SIMILARITY = 0.5;
const RERANK_MIN_K = 5;

interface SearchParamsState {
  storeId: string;
  tenantId: string;
  query: string;
  mode: SearchMode;
  topK: number;
  minSimilarity: number;
  rerank: boolean;
}

interface SearchRunHandlers {
  setResponse: (r: SearchResponse | null) => void;
  setSubmittedQuery: (q: string) => void;
  setPending: (p: boolean) => void;
  requestIdRef: React.RefObject<number>;
}

async function executeSearch(
  params: SearchParamsState,
  handlers: SearchRunHandlers
): Promise<void> {
  const myId = handlers.requestIdRef.current + 1;
  handlers.requestIdRef.current = myId;
  handlers.setSubmittedQuery(params.query);
  handlers.setPending(true);
  const { result } = await searchAction(params.storeId, params.tenantId, params.mode, params.query, {
    topK: params.topK,
    minSimilarity: params.minSimilarity,
    rerank: params.rerank,
  });
  if (myId !== handlers.requestIdRef.current) return;
  handlers.setResponse(result);
  handlers.setPending(false);
}

function useTenantSearch(storeId: string, tenantId: string): UseTenantSearchReturn {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('simple');
  const [topK, setTopK] = useState(DEFAULT_TOP_K);
  const [minSimilarity, setMinSimilarity] = useState(DEFAULT_MIN_SIMILARITY);
  const [rerank, setRerank] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [isPending, setPending] = useState(false);
  const requestIdRef = useRef(0);
  const effectiveRerank = mode === 'hybrid' || (rerank && topK >= RERANK_MIN_K);

  const submit = useCallback((): void => {
    const trimmed = query.trim();
    if (trimmed === '') return;
    void executeSearch(
      { storeId, tenantId, query: trimmed, mode, topK, minSimilarity, rerank: effectiveRerank },
      { setResponse, setSubmittedQuery, setPending, requestIdRef }
    );
  }, [storeId, tenantId, query, mode, topK, minSimilarity, effectiveRerank]);

  const clear = useCallback((): void => {
    requestIdRef.current += 1;
    setQuery('');
    setSubmittedQuery('');
    setResponse(null);
    setPending(false);
  }, []);

  return {
    response,
    query,
    mode,
    topK,
    minSimilarity,
    rerank,
    submittedQuery,
    isPending,
    setQuery,
    setMode,
    setTopK,
    setMinSimilarity,
    setRerank,
    submit,
    clear,
  };
}

interface SearchState {
  visibleFiles: RagFileRow[];
  chunksByFile: Map<string, SemanticChunk[]>;
  isSearchActive: boolean;
  isSearchPending: boolean;
  showNoMatches: boolean;
}

const EMPTY_CHUNKS_MAP: Map<string, SemanticChunk[]> = new Map();

function groupChunksByFile(response: SearchResponse): Map<string, SemanticChunk[]> {
  const map = new Map<string, SemanticChunk[]>();
  for (const c of response.chunks ?? []) {
    const arr = map.get(c.rag_file_id) ?? [];
    arr.push(c);
    map.set(c.rag_file_id, arr);
  }
  return map;
}

function deriveSearchState(files: RagFileRow[], search: UseTenantSearchReturn): SearchState {
  const isSearching = search.submittedQuery !== '';
  if (!isSearching)
    return {
      visibleFiles: files,
      chunksByFile: EMPTY_CHUNKS_MAP,
      isSearchActive: false,
      isSearchPending: false,
      showNoMatches: false,
    };
  if (search.isPending || search.response === null)
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
    showNoMatches: visibleFiles.length === NO_FILES,
  };
}

interface FileListProps {
  storeId: string;
  files: RagFileRow[];
  onRefresh: () => void;
  isSearchActive: boolean;
  chunksByFile: Map<string, SemanticChunk[]>;
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
  chunksByFile: Map<string, SemanticChunk[]>;
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
  onFiles: (files: File[]) => void;
}

function HeaderRow({ loaded, usage, onFiles }: HeaderRowProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2">
      {loaded ? <UsageSummary usage={usage} /> : <div />}
      {loaded && <UploadFilesButton onFiles={onFiles} />}
    </div>
  );
}

interface UseUploadDialogInput {
  storeId: string;
  tenantId: string;
  onAllDone: () => void;
}

interface UseUploadDialogReturn {
  dialog: React.JSX.Element;
  open: (files: File[]) => void;
  isOpen: boolean;
}

function useUploadDialog({
  storeId,
  tenantId,
  onAllDone,
}: UseUploadDialogInput): UseUploadDialogReturn {
  const [isOpen, setIsOpen] = useState(false);
  const stagedState = useStagedFiles();
  const { isUploading, start } = useStagedUpload({
    storeId,
    tenantId,
    staged: stagedState.staged,
    update: stagedState.update,
    onFileConfirmed: onAllDone,
  });

  const allDone =
    isOpen &&
    !isUploading &&
    stagedState.staged.length > NO_FILES &&
    stagedState.staged.every((s) => s.status === 'done' || s.status === 'failed');

  const open = useCallback(
    (files: File[]): void => {
      if (files.length === 0) return;
      stagedState.add(files);
      setIsOpen(true);
    },
    [stagedState]
  );

  const close = useCallback((): void => {
    setIsOpen(false);
    stagedState.clear();
    onAllDone();
  }, [onAllDone, stagedState]);

  const dialog = (
    <StagedFilesDialog
      storeId={storeId}
      open={isOpen}
      staged={stagedState.staged}
      isUploading={isUploading}
      isAllDone={allDone}
      onAdd={stagedState.add}
      onRemove={stagedState.remove}
      onOcrChange={stagedState.setOcr}
      onOcrModeChange={stagedState.setOcrMode}
      onLanguagesChange={stagedState.setLanguages}
      onUpdate={stagedState.update}
      onStartUpload={start}
      onClose={close}
    />
  );

  return { dialog, open, isOpen };
}

interface PageBodyProps {
  loaded: boolean;
  hasFiles: boolean;
  storeId: string;
  visibleFiles: RagFileRow[];
  refresh: () => void;
  search: UseTenantSearchReturn;
  isSearchActive: boolean;
  isSearchPending: boolean;
  showNoMatches: boolean;
  chunksByFile: Map<string, SemanticChunk[]>;
  openUploadDialog: (files: File[]) => void;
}

function PageBody({
  loaded,
  hasFiles,
  storeId,
  visibleFiles,
  refresh,
  search,
  isSearchActive,
  isSearchPending,
  showNoMatches,
  chunksByFile,
  openUploadDialog,
}: PageBodyProps): React.JSX.Element {
  if (!loaded) return <LoadingSpinner />;
  if (!hasFiles) return <FileUploadDropzone onFiles={openUploadDialog} />;
  return (
    <>
      <RagSearchBar
        query={search.query}
        mode={search.mode}
        topK={search.topK}
        minSimilarity={search.minSimilarity}
        rerank={search.rerank}
        isSearching={search.isPending}
        canClear={search.submittedQuery !== ''}
        onQueryChange={search.setQuery}
        onModeChange={search.setMode}
        onTopKChange={search.setTopK}
        onMinSimilarityChange={search.setMinSimilarity}
        onRerankChange={search.setRerank}
        onSubmit={search.submit}
        onClear={search.clear}
      />
      <FileListSection
        storeId={storeId}
        files={visibleFiles}
        onRefresh={refresh}
        isSearchActive={isSearchActive}
        isSearchPending={isSearchPending}
        showNoMatches={showNoMatches}
        chunksByFile={chunksByFile}
      />
    </>
  );
}

export function RagTenantContent({ storeId, tenantId }: RagTenantContentProps): React.JSX.Element {
  const { files, usage, loaded, refresh } = useTenantFiles(storeId, tenantId);
  const search = useTenantSearch(storeId, tenantId);
  const { dialog, open: openUploadDialog, isOpen } = useUploadDialog({
    storeId,
    tenantId,
    onAllDone: () => {
      void refresh();
    },
  });

  const { visibleFiles, chunksByFile, isSearchActive, isSearchPending, showNoMatches } =
    deriveSearchState(files, search);
  const hasFiles = files.length > NO_FILES;

  const { isDragging, handlers } = usePageDrag({
    skip: isOpen || !hasFiles,
    onFiles: openUploadDialog,
  });

  return (
    <div className="relative flex flex-1 min-h-0 flex-col gap-2 p-3 py-2" {...handlers}>
      <HeaderRow loaded={loaded} usage={usage} onFiles={openUploadDialog} />
      <PageBody
        loaded={loaded}
        hasFiles={hasFiles}
        storeId={storeId}
        visibleFiles={visibleFiles}
        refresh={() => void refresh()}
        search={search}
        isSearchActive={isSearchActive}
        isSearchPending={isSearchPending}
        showNoMatches={showNoMatches}
        chunksByFile={chunksByFile}
        openUploadDialog={openUploadDialog}
      />
      {isDragging && <PageDragOverlay />}
      {dialog}
    </div>
  );
}
