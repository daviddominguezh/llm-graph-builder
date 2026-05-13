'use client';

import { getChunksAction } from '@/app/actions/ragFiles';
import { TablePagination } from '@/app/components/dashboard/TablePagination';
import { getCachedChunks, setCachedChunks } from '@/app/lib/ragCache';
import type { RagChunkRow, SemanticChunk } from '@/app/lib/ragFiles';
import { Button } from '@/components/ui/button';
import { Check, Copy, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

export type DisplayChunk = RagChunkRow & { distance?: number; rerank_score?: number; rank?: number };

interface FileChunksTableProps {
  storeId: string;
  fileId: string;
  overrideChunks?: SemanticChunk[];
}

const PAGE_SIZE = 25;
const FIRST_PAGE = 0;
const BACKEND_PAGE_OFFSET = 1;
const MIN_TOTAL_PAGES = 1;
const ZERO = 0;
const ONE = 1;
const SIMILARITY_DIGITS = 3;
const OVERFLOW_TOLERANCE_PX = 1;
const HEADER_CELL_CLASS =
  'h-7 px-3 text-left text-[10px] uppercase tracking-wider font-semibold text-foreground whitespace-nowrap border-r last:border-r-0';
const META_CELL_CLASS =
  'align-top px-3 py-2 font-mono text-[10px] text-muted-foreground whitespace-nowrap border-r';

type LoadStage = 'pending' | 'fetching' | 'ready';

interface ChunksState {
  key: string;
  phase: 'fetching' | 'ready';
  rows: RagChunkRow[];
  totalCount: number;
}

interface UseChunksReturn {
  rows: RagChunkRow[];
  totalCount: number;
  stage: LoadStage;
}

function loadKeyFor(fileId: string, page: number): string {
  return `${fileId}::${String(page)}`;
}

function useChunks(storeId: string, fileId: string, page: number): UseChunksReturn {
  const [state, setState] = useState<ChunksState | null>(null);
  const key = loadKeyFor(fileId, page);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await getCachedChunks(fileId, page);
      if (cancelled) return;
      if (cached !== null) {
        setState({ key, phase: 'ready', rows: cached.rows, totalCount: cached.totalCount });
        return;
      }
      setState({ key, phase: 'fetching', rows: [], totalCount: ZERO });
      const { result } = await getChunksAction(storeId, fileId, page + BACKEND_PAGE_OFFSET, PAGE_SIZE);
      if (cancelled) return;
      setState({ key, phase: 'ready', rows: result.rows, totalCount: result.totalCount });
      await setCachedChunks(fileId, page, result);
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, page, storeId, key]);

  const matches = state !== null && state.key === key;
  let stage: LoadStage = 'pending';
  if (matches && state.phase === 'fetching') stage = 'fetching';
  else if (matches && state.phase === 'ready') stage = 'ready';
  const rows = stage === 'ready' && matches ? state.rows : [];
  const totalCount = stage === 'ready' && matches ? state.totalCount : ZERO;
  return { rows, totalCount, stage };
}

const NEWLINE_GLYPH = ' ↵ ';
const COPIED_TIMEOUT_MS = 1500;

function collapseNewlines(text: string): string {
  return text.replace(/\n+/g, NEWLINE_GLYPH);
}

interface CopyButtonProps {
  content: string;
}

function CopyButton({ content }: CopyButtonProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  const [copied, setCopied] = useState(false);
  async function onCopy(): Promise<void> {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_TIMEOUT_MS);
  }
  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      className="bg-background rounded-md hover:bg-input! dark:hover:bg-input!"
      onClick={() => void onCopy()}
    >
      {copied ? <Check /> : <Copy />}
      <span>{copied ? t('copied') : t('copy')}</span>
    </Button>
  );
}

interface ChunkActionsProps {
  content: string;
  expanded: boolean;
  showViewToggle: boolean;
  onToggleExpand: () => void;
}

function ChunkActions({
  content,
  expanded,
  showViewToggle,
  onToggleExpand,
}: ChunkActionsProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  return (
    <div
      className={`bg-background absolute z-9999 right-0 flex items-center gap-1 opacity-0 transition-opacity group-hover/chunk:opacity-100 pl-2 ${
        expanded ? 'bottom-0' : 'top-1/2 -translate-y-1/2'
      }`}
    >
      {showViewToggle && (
        <Button
          type="button"
          size="xs"
          variant="link"
          className="bg-background text-blue-600! dark:text-blue-400! rounded-md"
          onClick={onToggleExpand}
        >
          {expanded ? t('viewLess') : t('viewAll')}
        </Button>
      )}
      <CopyButton content={content} />
    </div>
  );
}

function ChunkContent({ content }: { content: string }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    setOverflows(el.scrollHeight > el.clientHeight + OVERFLOW_TOLERANCE_PX);
  }, [content, expanded]);

  const showViewToggle = overflows || expanded;
  return (
    <div className="relative">
      <p
        ref={ref}
        className={`whitespace-pre-wrap text-[10px] leading-relaxed ${expanded ? '' : 'line-clamp-1'}`}
      >
        {expanded ? content : collapseNewlines(content)}
      </p>
      <ChunkActions
        content={content}
        expanded={expanded}
        showViewToggle={showViewToggle}
        onToggleExpand={() => setExpanded((v) => !v)}
      />
    </div>
  );
}

function formatSimilarity(distance: number): string {
  return (ONE - distance).toFixed(SIMILARITY_DIGITS);
}

function formatScore(score: number): string {
  return score.toFixed(SIMILARITY_DIGITS);
}

function hasDistance(c: DisplayChunk): c is DisplayChunk & { distance: number } {
  return typeof c.distance === 'number';
}

function hasScore(c: DisplayChunk): c is DisplayChunk & { rerank_score: number } {
  return typeof c.rerank_score === 'number';
}

function hasRank(c: DisplayChunk): c is DisplayChunk & { rank: number } {
  return typeof c.rank === 'number';
}

function similarityCell(c: DisplayChunk): string {
  if (hasScore(c)) return formatScore(c.rerank_score);
  if (hasDistance(c)) return formatSimilarity(c.distance);
  if (hasRank(c)) return formatScore(c.rank);
  return '—';
}

function pageLabel(c: DisplayChunk, t: ReturnType<typeof useTranslations>): string {
  const start = c.page_number ?? ZERO;
  const end = c.page_end;
  if (end !== null && end !== undefined && end !== start) {
    return t('pageRange', { start, end });
  }
  return t('page', { page: start });
}

function ChunkTableRow({
  c,
  showSimilarity,
}: {
  c: DisplayChunk;
  showSimilarity: boolean;
}): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  return (
    <tr className="border-b last:border-b-0">
      <td className={META_CELL_CLASS}>{pageLabel(c, t)}</td>
      {showSimilarity && <td className={META_CELL_CLASS}>{similarityCell(c)}</td>}
      <td className="group/chunk align-top py-2 px-3">
        <ChunkContent content={c.content} />
      </td>
    </tr>
  );
}

interface ChunksTableProps {
  stage: LoadStage;
  rows: DisplayChunk[];
}

function ChunksTable({ stage, rows }: ChunksTableProps): React.JSX.Element | null {
  const t = useTranslations('knowledgeBase.ragChunks');
  if (stage === 'pending') return null;
  if (stage === 'fetching') {
    return (
      <div className="flex items-center justify-center px-4 py-8">
        <Loader2 className="size-4 animate-spin text-blue-500" />
      </div>
    );
  }
  const showSimilarity = rows.some((r) => hasDistance(r) || hasScore(r) || hasRank(r));
  // Plain <table> — shadcn's Table wraps in `overflow-x-auto`, which creates
  // its own scroll container and breaks sticky <thead> relative to the outer
  // Scrollable. Render the table directly so sticky positions against the
  // page-level scroller.
  return (
    <table className="w-full caption-bottom text-sm">
      <thead className="sticky top-9 z-10 bg-background">
        <tr className="border-b">
          <th className={`${HEADER_CELL_CLASS} w-px`}>{t('colPage')}</th>
          {showSimilarity && <th className={`${HEADER_CELL_CLASS} w-px`}>{t('colSimilarity')}</th>}
          <th className={HEADER_CELL_CLASS}>{t('colContent')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <ChunkTableRow key={c.id} c={c} showSimilarity={showSimilarity} />
        ))}
      </tbody>
    </table>
  );
}

function NoMatchingChunks(): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  return <div className="px-3 py-3 text-[10px] font-mono text-muted-foreground">{t('noMatchInFile')}</div>;
}

function StaticChunks({ chunks }: { chunks: SemanticChunk[] }): React.JSX.Element {
  if (chunks.length === ZERO) return <NoMatchingChunks />;
  return <ChunksTable stage="ready" rows={chunks} />;
}

function FetchedChunks({ storeId, fileId }: { storeId: string; fileId: string }): React.JSX.Element {
  const [page, setPage] = useState(FIRST_PAGE);
  const { rows, totalCount, stage } = useChunks(storeId, fileId, page);
  const totalPages = Math.max(MIN_TOTAL_PAGES, Math.ceil(totalCount / PAGE_SIZE));
  return (
    <>
      <ChunksTable stage={stage} rows={rows} />
      <div className="rounded-b-md border-t bg-background">
        <TablePagination
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>
    </>
  );
}

export function FileChunksTable({
  storeId,
  fileId,
  overrideChunks,
}: FileChunksTableProps): React.JSX.Element {
  if (overrideChunks !== undefined) return <StaticChunks chunks={overrideChunks} />;
  return <FetchedChunks storeId={storeId} fileId={fileId} />;
}
