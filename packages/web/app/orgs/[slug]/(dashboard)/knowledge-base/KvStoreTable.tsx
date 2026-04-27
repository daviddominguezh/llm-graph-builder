'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useMemo, useState } from 'react';

import { makeId } from './uploaderHelpers';

interface KvEntry {
  id: string;
  key: string;
  value: string;
}

const CELL_INPUT_BASE =
  'w-full bg-transparent border-0 outline-none px-2 py-1 text-xs tabular-nums rounded transition duration-150';
const HEADER_CELL =
  'h-8 text-[10px] uppercase tracking-wider font-medium text-muted-foreground/70';
const PAGE_SIZE = 20;

interface KvKeyCellProps {
  entry: KvEntry;
  isTrailingEmpty: boolean;
  isDuplicate: boolean;
  onUpdate: (id: string, field: 'key' | 'value', value: string) => void;
}

function KvKeyCell({ entry, isTrailingEmpty, isDuplicate, onUpdate }: KvKeyCellProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.kv');
  const ph = isTrailingEmpty ? t('addKeyPlaceholder') : t('keyPlaceholder');
  const phItalic = isTrailingEmpty ? 'placeholder:italic' : '';
  const dupCls = isDuplicate ? 'ring-1 ring-destructive' : '';
  return (
    <TableCell className="p-1 align-top">
      <input
        className={`${CELL_INPUT_BASE} font-mono ${phItalic} ${dupCls}`}
        value={entry.key}
        placeholder={ph}
        onChange={(e) => onUpdate(entry.id, 'key', e.target.value)}
      />
      {isDuplicate && (
        <span className="block px-2 pt-0.5 text-[11px] text-destructive animate-in fade-in duration-150">
          {t('duplicateKey')}
        </span>
      )}
    </TableCell>
  );
}

interface KvValueCellProps {
  entry: KvEntry;
  isTrailingEmpty: boolean;
  onUpdate: (id: string, field: 'key' | 'value', value: string) => void;
}

function KvValueCell({ entry, isTrailingEmpty, onUpdate }: KvValueCellProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.kv');
  const ph = isTrailingEmpty ? t('addValuePlaceholder') : t('valuePlaceholder');
  const phItalic = isTrailingEmpty ? 'placeholder:italic' : '';
  return (
    <TableCell className="p-1 align-top">
      <input
        className={`${CELL_INPUT_BASE} ${phItalic}`}
        value={entry.value}
        placeholder={ph}
        onChange={(e) => onUpdate(entry.id, 'value', e.target.value)}
      />
    </TableCell>
  );
}

interface KvRowProps {
  entry: KvEntry;
  isTrailingEmpty: boolean;
  isDuplicate: boolean;
  onUpdate: (id: string, field: 'key' | 'value', value: string) => void;
  onRequestRemove: (id: string) => void;
}

function KvRow({ entry, isTrailingEmpty, isDuplicate, onUpdate, onRequestRemove }: KvRowProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.kv');
  return (
    <TableRow className="hover:bg-muted/30 animate-in fade-in slide-in-from-top-1 duration-200">
      <KvKeyCell
        entry={entry}
        isTrailingEmpty={isTrailingEmpty}
        isDuplicate={isDuplicate}
        onUpdate={onUpdate}
      />
      <KvValueCell entry={entry} isTrailingEmpty={isTrailingEmpty} onUpdate={onUpdate} />
      <TableCell className="p-1 text-right align-top">
        {!isTrailingEmpty && (
          <Button
            variant="destructive"
            className="size-6 p-0"
            aria-label={t('remove')}
            tabIndex={-1}
            onClick={() => onRequestRemove(entry.id)}
          >
            <Trash2 />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

interface SearchInputProps {
  query: string;
  onChange: (q: string) => void;
}

function SearchInput({ query, onChange }: SearchInputProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.kv');
  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') onChange('');
  }
  return (
    <div className="relative w-48">
      <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={t('search')}
        className="h-7 pl-7 text-xs"
      />
    </div>
  );
}

function KvHeaderRow(): React.JSX.Element {
  const t = useTranslations('knowledgeBase.kv');
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead className={HEADER_CELL}>{t('headerKey')}</TableHead>
      <TableHead className={HEADER_CELL}>{t('headerValue')}</TableHead>
      <TableHead className={`w-12 ${HEADER_CELL}`} />
    </TableRow>
  );
}

function KvNoResultsRow({ query }: { query: string }): React.JSX.Element {
  const t = useTranslations('knowledgeBase.kv');
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={3} className="py-4 text-center text-xs text-muted-foreground">
        {t('noResults', { query })}
      </TableCell>
    </TableRow>
  );
}

interface KvTableViewProps {
  entries: KvEntry[];
  trailingEmpty: KvEntry | null;
  duplicateKeys: Set<string>;
  showNoResults: boolean;
  query: string;
  onUpdate: (id: string, field: 'key' | 'value', value: string) => void;
  onRequestRemove: (id: string) => void;
}

function KvTableView(props: KvTableViewProps): React.JSX.Element {
  const { entries, trailingEmpty, duplicateKeys, showNoResults, query, onUpdate, onRequestRemove } = props;
  const rows = useMemo(() => {
    const list: Array<{ entry: KvEntry; isTrailingEmpty: boolean }> = entries.map((e) => ({
      entry: e,
      isTrailingEmpty: false,
    }));
    if (trailingEmpty !== null) list.push({ entry: trailingEmpty, isTrailingEmpty: true });
    return list;
  }, [entries, trailingEmpty]);
  return (
    <Table>
      <TableHeader>
        <KvHeaderRow />
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <KvRow
            key={row.entry.id}
            entry={row.entry}
            isTrailingEmpty={row.isTrailingEmpty}
            isDuplicate={row.entry.key !== '' && duplicateKeys.has(row.entry.key)}
            onUpdate={onUpdate}
            onRequestRemove={onRequestRemove}
          />
        ))}
        {showNoResults && <KvNoResultsRow query={query} />}
      </TableBody>
    </Table>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

function Pagination({ page, totalPages, onChange }: PaginationProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.kv');
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label={t('prevPage')}
      >
        <ChevronLeft />
      </Button>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground px-1.5">
        {t('pageOf', { page, total: totalPages })}
      </span>
      <Button
        variant="ghost"
        size="icon"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label={t('nextPage')}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

interface KvFooterProps {
  count: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function KvFooter({ count, page, totalPages, onPageChange }: KvFooterProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.kv');
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] tabular-nums text-muted-foreground">
        {t('entries', { count })}
      </span>
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onChange={onPageChange} />
      )}
    </div>
  );
}

interface KvDeleteDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function KvDeleteDialog({ open, onCancel, onConfirm }: KvDeleteDialogProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.kv');
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('deleteDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('deleteCancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t('deleteConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function isEmptyEntry(entry: KvEntry): boolean {
  return entry.key === '' && entry.value === '';
}

function ensureTrailingEmpty(entries: KvEntry[]): KvEntry[] {
  const last = entries[entries.length - 1];
  if (last !== undefined && isEmptyEntry(last)) return entries;
  return [...entries, { id: makeId(), key: '', value: '' }];
}

function filterEntries(entries: KvEntry[], query: string): KvEntry[] {
  if (query.trim() === '') return entries;
  const lower = query.toLowerCase();
  return entries.filter(
    (e) => e.key.toLowerCase().includes(lower) || e.value.toLowerCase().includes(lower),
  );
}

function computeDuplicateKeys(entries: KvEntry[]): Set<string> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.key === '') continue;
    counts.set(entry.key, (counts.get(entry.key) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [key, count] of counts) {
    if (count > 1) duplicates.add(key);
  }
  return duplicates;
}

interface KvDerived {
  trailingEmpty: KvEntry | null;
  filtered: KvEntry[];
  pageEntries: KvEntry[];
  totalPages: number;
  clampedPage: number;
  isLastPage: boolean;
}

function useKvDerived(entries: KvEntry[], query: string, page: number): KvDerived {
  const realEntries = useMemo(() => entries.slice(0, -1), [entries]);
  const trailingEmpty = entries[entries.length - 1] ?? null;
  const filtered = useMemo(() => filterEntries(realEntries, query), [realEntries, query]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const start = (clampedPage - 1) * PAGE_SIZE;
  const pageEntries = filtered.slice(start, start + PAGE_SIZE);
  return { trailingEmpty, filtered, pageEntries, totalPages, clampedPage, isLastPage: clampedPage === totalPages };
}

interface KvEntriesApi {
  entries: KvEntry[];
  update: (id: string, field: 'key' | 'value', value: string) => void;
  remove: (id: string) => void;
}

function useKvEntries(onAddedRow: (newRealCount: number) => void): KvEntriesApi {
  const [entries, setEntries] = useState<KvEntry[]>(() => ensureTrailingEmpty([]));

  function update(id: string, field: 'key' | 'value', value: string) {
    const idx = entries.findIndex((e) => e.id === id);
    const last = entries[entries.length - 1];
    const wasTrailing = idx === entries.length - 1 && last !== undefined && isEmptyEntry(last);
    const next = entries.map((e) => (e.id === id ? { ...e, [field]: value } : e));
    const final = ensureTrailingEmpty(next);
    setEntries(final);
    if (wasTrailing) onAddedRow(final.length - 1);
  }

  function remove(id: string) {
    setEntries(ensureTrailingEmpty(entries.filter((e) => e.id !== id)));
  }

  return { entries, update, remove };
}

export function KvStoreTable(): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  function navigateAfterAdd(realCount: number) {
    setPage(Math.max(1, Math.ceil(realCount / PAGE_SIZE)));
  }

  const { entries, update, remove } = useKvEntries(navigateAfterAdd);
  const d = useKvDerived(entries, query, page);
  const duplicateKeys = useMemo(() => computeDuplicateKeys(entries), [entries]);
  const showNoResults = query.trim() !== '' && d.filtered.length === 0;

  function handleConfirmDelete() {
    if (deleteTargetId !== null) {
      remove(deleteTargetId);
      setDeleteTargetId(null);
    }
  }

  return (
    <>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-end">
            <SearchInput query={query} onChange={setQuery} />
          </div>
          <KvTableView
            entries={d.pageEntries}
            trailingEmpty={d.isLastPage && query.trim() === '' ? d.trailingEmpty : null}
            duplicateKeys={duplicateKeys}
            showNoResults={showNoResults}
            query={query}
            onUpdate={update}
            onRequestRemove={setDeleteTargetId}
          />
        </div>
        <div className="mt-auto border-t border-border/30 pt-4">
          <KvFooter
            count={d.filtered.length}
            page={d.clampedPage}
            totalPages={d.totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>
      <KvDeleteDialog
        open={deleteTargetId !== null}
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
