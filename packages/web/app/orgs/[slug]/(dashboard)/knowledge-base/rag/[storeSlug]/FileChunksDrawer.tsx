'use client';

import { getChunksAction } from '@/app/actions/ragFiles';
import { Scrollable } from '@/app/components/Scrollable';
import type { RagChunkRow, RagFileRow } from '@/app/lib/ragFiles';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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

interface FileChunksDrawerProps {
  storeId: string;
  file: RagFileRow | null;
  onOpenChange: (open: boolean) => void;
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

function loadKeyFor(file: RagFileRow | null, page: number): string {
  return file === null ? '' : `${file.id}::${String(page)}`;
}

function useChunks(
  storeId: string,
  file: RagFileRow | null,
  page: number
): { rows: RagChunkRow[]; loading: boolean } {
  const [state, setState] = useState<LoadedChunks | null>(null);
  const key = loadKeyFor(file, page);

  useEffect(() => {
    if (file === null) return;
    let cancelled = false;
    void (async () => {
      const { result } = await getChunksAction(storeId, file.id, page, PAGE_SIZE);
      if (!cancelled) setState({ key, rows: result });
    })();
    return () => {
      cancelled = true;
    };
  }, [file, page, storeId, key]);

  const ready = state !== null && state.key === key;
  return { rows: ready ? state.rows : [], loading: !ready };
}

interface ChunksPagerProps {
  page: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
}

function ChunksPager({ page, count, onPrev, onNext }: ChunksPagerProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  return (
    <div className="flex justify-between items-center px-4 py-3 border-t">
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
    return (
      <div className="px-4 py-6 text-xs text-muted-foreground">{t('loading')}</div>
    );
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

export function FileChunksDrawer({
  storeId,
  file,
  onOpenChange,
}: FileChunksDrawerProps): React.JSX.Element | null {
  const [page, setPage] = useState(FIRST_PAGE);
  const { rows, loading } = useChunks(storeId, file, page);
  const t = useTranslations('knowledgeBase.ragChunks');

  if (file === null) return null;

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="!w-[min(960px,90vw)] !max-w-none flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="font-mono text-sm">{file.filename}</SheetTitle>
          <SheetDescription className="text-[11px] text-muted-foreground">
            {t('drawerSubtitle', { count: rows.length })}
          </SheetDescription>
        </SheetHeader>
        <Scrollable className="flex-1 min-h-0">
          <ChunksTable loading={loading} rows={rows} />
        </Scrollable>
        <ChunksPager
          page={page}
          count={rows.length}
          onPrev={() => setPage(page - 1)}
          onNext={() => setPage(page + 1)}
        />
      </SheetContent>
    </Sheet>
  );
}
