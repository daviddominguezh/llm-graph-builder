'use client';

import { getChunksAction } from '@/app/actions/ragFiles';
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
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface FileChunksTableProps {
  storeId: string;
  fileId: string;
}

const PAGE_SIZE = 25;
const FIRST_PAGE = 1;
const ZERO = 0;
const HEADER_CELL_CLASS =
  'h-7 text-[10px] uppercase tracking-wider font-medium text-muted-foreground/70 whitespace-nowrap';

interface LoadedChunks {
  key: string;
  rows: RagChunkRow[];
}

function loadKeyFor(fileId: string, page: number): string {
  return `${fileId}::${String(page)}`;
}

function useChunks(
  storeId: string,
  fileId: string,
  page: number
): { rows: RagChunkRow[]; loading: boolean } {
  const [state, setState] = useState<LoadedChunks | null>(null);
  const key = loadKeyFor(fileId, page);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { result } = await getChunksAction(storeId, fileId, page, PAGE_SIZE);
      if (!cancelled) setState({ key, rows: result });
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, page, storeId, key]);

  const ready = state !== null && state.key === key;
  return { rows: ready ? state.rows : [], loading: !ready };
}

function ChunkTableRow({ c }: { c: RagChunkRow }): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  return (
    <TableRow className="hover:bg-transparent align-top">
      <TableCell className="font-mono text-[10px] text-muted-foreground py-2 whitespace-nowrap">
        {t('page', { page: c.page_number ?? ZERO })}
      </TableCell>
      <TableCell className="font-mono text-[10px] text-muted-foreground py-2 whitespace-nowrap">
        {t('paragraph', { idx: c.paragraph_idx ?? ZERO })}
      </TableCell>
      <TableCell className="font-mono text-[10px] text-muted-foreground py-2 whitespace-nowrap">
        {c.token_count !== null ? t('tokens', { count: c.token_count }) : '—'}
      </TableCell>
      <TableCell className="text-xs py-2 whitespace-pre-wrap leading-relaxed">{c.content}</TableCell>
    </TableRow>
  );
}

interface ChunksTableProps {
  loading: boolean;
  rows: RagChunkRow[];
}

function ChunksTable({ loading, rows }: ChunksTableProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  if (loading) {
    return <div className="px-4 py-4 text-xs text-muted-foreground">{t('loading')}</div>;
  }
  return (
    <Table>
      <TableHeader>
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

function Pager({ page, count, onPrev, onNext }: PagerProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  if (page === FIRST_PAGE && count < PAGE_SIZE) return <></>;
  return (
    <div className="flex items-center justify-between px-3 py-2 border-t">
      <Button size="sm" variant="outline" disabled={page <= FIRST_PAGE} onClick={onPrev}>
        {t('prev')}
      </Button>
      <span className="text-[11px] font-mono text-muted-foreground">{t('page', { page })}</span>
      <Button size="sm" variant="outline" disabled={count < PAGE_SIZE} onClick={onNext}>
        {t('next')}
      </Button>
    </div>
  );
}

export function FileChunksTable({ storeId, fileId }: FileChunksTableProps): React.JSX.Element {
  const [page, setPage] = useState(FIRST_PAGE);
  const { rows, loading } = useChunks(storeId, fileId, page);
  return (
    <>
      <ChunksTable loading={loading} rows={rows} />
      <Pager
        page={page}
        count={rows.length}
        onPrev={() => setPage(page - 1)}
        onNext={() => setPage(page + 1)}
      />
    </>
  );
}
