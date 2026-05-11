'use client';

import { getChunksAction } from '@/app/actions/ragFiles';
import { Scrollable } from '@/app/components/Scrollable';
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
const FIRST_PAGE = 1;
const ZERO = 0;

function ChunkCard({ c }: { c: RagChunkRow }): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  return (
    <div className="rounded-md border p-3 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
        <span>{t('page', { page: c.page_number ?? ZERO })}</span>
        <span>·</span>
        <span>{t('paragraph', { idx: c.paragraph_idx ?? ZERO })}</span>
        {c.token_count !== null && (
          <>
            <span>·</span>
            <span>{t('tokens', { count: c.token_count })}</span>
          </>
        )}
      </div>
      <p className="text-xs whitespace-pre-wrap">{c.content}</p>
    </div>
  );
}

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
    <div className="flex justify-between items-center pt-2">
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

interface ChunksListProps {
  loading: boolean;
  rows: RagChunkRow[];
}

function ChunksList({ loading, rows }: ChunksListProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.ragChunks');
  if (loading) {
    return <span className="text-xs text-muted-foreground">{t('loading')}</span>;
  }
  return (
    <>
      {rows.map((c) => (
        <ChunkCard key={c.id} c={c} />
      ))}
    </>
  );
}

export function FileChunksDrawer({
  storeId,
  file,
  onOpenChange,
}: FileChunksDrawerProps): React.JSX.Element | null {
  const [page, setPage] = useState(FIRST_PAGE);
  const { rows, loading } = useChunks(storeId, file, page);

  if (file === null) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{file.filename}</DialogTitle>
        </DialogHeader>
        <Scrollable className="flex-1 min-h-0">
          <div className="flex flex-col gap-2">
            <ChunksList loading={loading} rows={rows} />
          </div>
        </Scrollable>
        <ChunksPager
          page={page}
          count={rows.length}
          onPrev={() => setPage(page - 1)}
          onNext={() => setPage(page + 1)}
        />
      </DialogContent>
    </Dialog>
  );
}
