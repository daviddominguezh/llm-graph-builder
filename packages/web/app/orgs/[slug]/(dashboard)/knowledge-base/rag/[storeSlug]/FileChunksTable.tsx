'use client';

import { getChunksAction } from '@/app/actions/ragFiles';
import { getCachedChunks, setCachedChunks } from '@/app/lib/ragCache';
import type { RagChunkRow } from '@/app/lib/ragFiles';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

interface FileChunksTableProps {
  storeId: string;
  fileId: string;
}

const PAGE_SIZE = 25;
const FIRST_PAGE = 1;
const ZERO = 0;
const OVERFLOW_TOLERANCE_PX = 1;
const HEADER_CELL_CLASS =
  'h-7 text-[10px] uppercase tracking-wider font-semibold text-foreground whitespace-nowrap border-r last:border-r-0';
const META_CELL_CLASS =
  'align-top font-mono text-[10px] text-muted-foreground py-2 whitespace-nowrap border-r';

type LoadStage = 'pending' | 'fetching' | 'ready';

interface ChunksState {
  key: string;
  phase: 'fetching' | 'ready';
  rows: RagChunkRow[];
}

interface UseChunksReturn {
  rows: RagChunkRow[];
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
        setState({ key, phase: 'ready', rows: cached });
        return;
      }
      setState({ key, phase: 'fetching', rows: [] });
      const { result } = await getChunksAction(storeId, fileId, page, PAGE_SIZE);
      if (cancelled) return;
      setState({ key, phase: 'ready', rows: result });
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
  return { rows, stage };
}

function ChunkContent({ content }: { content: string }): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    setOverflows(el.scrollHeight > el.clientHeight + OVERFLOW_TOLERANCE_PX);
  }, [content]);

  return (
    <div className="flex flex-col gap-1">
      <p
        ref={ref}
        className={`whitespace-pre-wrap text-[10px] leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}
      >
        {content}
      </p>
      {overflows && (
        <Button
          type="button"
          variant="link"
          className="h-auto self-end p-0 text-xs text-blue-500"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t('viewLess') : t('viewAll')}
        </Button>
      )}
    </div>
  );
}

function ChunkTableRow({ c }: { c: RagChunkRow }): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className={META_CELL_CLASS}>{t('page', { page: c.page_number ?? ZERO })}</TableCell>
      <TableCell className={META_CELL_CLASS}>
        {t('paragraph', { idx: c.paragraph_idx ?? ZERO })}
      </TableCell>
      <TableCell className={META_CELL_CLASS}>
        {c.token_count !== null ? t('tokens', { count: c.token_count }) : '—'}
      </TableCell>
      <TableCell className="align-top py-2">
        <ChunkContent content={c.content} />
      </TableCell>
    </TableRow>
  );
}

interface ChunksTableProps {
  stage: LoadStage;
  rows: RagChunkRow[];
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
  return (
    <Table>
      <TableHeader className="sticky top-0 z-10 bg-background">
        <TableRow className="hover:bg-transparent">
          <TableHead className={HEADER_CELL_CLASS}>{t('colPage')}</TableHead>
          <TableHead className={HEADER_CELL_CLASS}>{t('colParagraph')}</TableHead>
          <TableHead className={HEADER_CELL_CLASS}>{t('colTokens')}</TableHead>
          <TableHead className={HEADER_CELL_CLASS}>{t('colContent')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <ChunkTableRow key={c.id} c={c} />
        ))}
      </TableBody>
    </Table>
  );
}

interface PagerProps {
  page: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}

function Pager({ page, count, onPrev, onNext }: PagerProps): React.JSX.Element | null {
  const t = useTranslations('knowledgeBase.ragChunks');
  if (page === FIRST_PAGE && count < PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-between border-t px-3 py-2">
      <Button size="sm" variant="outline" disabled={page <= FIRST_PAGE} onClick={onPrev}>
        {t('prev')}
      </Button>
      <span className="font-mono text-[11px] text-muted-foreground">{t('page', { page })}</span>
      <Button size="sm" variant="outline" disabled={count < PAGE_SIZE} onClick={onNext}>
        {t('next')}
      </Button>
    </div>
  );
}

export function FileChunksTable({ storeId, fileId }: FileChunksTableProps): React.JSX.Element {
  const [page, setPage] = useState(FIRST_PAGE);
  const { rows, stage } = useChunks(storeId, fileId, page);
  return (
    <>
      <ChunksTable stage={stage} rows={rows} />
      <Pager
        page={page}
        count={rows.length}
        onPrev={() => setPage(page - 1)}
        onNext={() => setPage(page + 1)}
      />
    </>
  );
}
