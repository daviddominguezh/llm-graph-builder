'use client';

import { createKvStoreAction, deleteKvStoreAction, updateKvStoreAction } from '@/app/actions/kvStores';
import { createRagStoreAction, deleteRagStoreAction, updateRagStoreAction } from '@/app/actions/ragStores';
import { Scrollable } from '@/app/components/Scrollable';
import type { KvStoreRow } from '@/app/lib/kvStores';
import type { RagStoreRow } from '@/app/lib/ragStores';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Database, MoreHorizontal, Plus, Search, Table } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type MouseEvent, useState } from 'react';

import { CreateStoreDialog, type StoreType } from './CreateStoreDialog';
import { RenameStoreDialog } from './RenameStoreDialog';

interface StoresSidebarProps {
  orgId: string;
  orgSlug: string;
  initialRagStores: RagStoreRow[];
  initialKvStores: KvStoreRow[];
}

interface SidebarItem {
  id: string;
  slug: string;
  name: string;
  type: StoreType;
  href: string;
}

function buildItems(
  ragStores: RagStoreRow[],
  kvStores: KvStoreRow[],
  orgSlug: string
): SidebarItem[] {
  const ragPrefix = `/orgs/${orgSlug}/knowledge-base/rag/`;
  const kvPrefix = `/orgs/${orgSlug}/knowledge-base/kv/`;
  const rag: SidebarItem[] = ragStores.map((s) => ({
    id: `rag:${s.id}`,
    slug: s.slug,
    name: s.name,
    type: 'rag',
    href: `${ragPrefix}${s.slug}`,
  }));
  const kv: SidebarItem[] = kvStores.map((s) => ({
    id: `kv:${s.id}`,
    slug: s.slug,
    name: s.name,
    type: 'kv',
    href: `${kvPrefix}${s.slug}`,
  }));
  return [...rag, ...kv].sort((a, b) => a.name.localeCompare(b.name));
}

function rawIdOf(item: SidebarItem): string {
  return item.id.slice(item.type.length + 1);
}

function SidebarHeader({ onCreateClick }: { onCreateClick: () => void }): React.JSX.Element {
  const t = useTranslations('knowledgeBase.storesSidebar');
  return (
    <div className="flex items-center justify-between pl-3 pr-1 py-1.5 pb-[calc(0px+var(--spacing)*1.5)] border-b border-b-[0.5px] mb-2.5">
      <h2 className="mt-[1px] font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
        {t('title').toUpperCase()}
      </h2>
      <Button
        variant="ghost"
        size="xs"
        className="aspect-square p-0! h-5 rounded-full"
        onClick={onCreateClick}
      >
        <Plus />
      </Button>
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}): React.JSX.Element {
  const t = useTranslations('knowledgeBase.storesSidebar');
  return (
    <div className="px-2 pb-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('search')}
          className="pl-7"
        />
      </div>
    </div>
  );
}

function StoreIcon({ type }: { type: StoreType }): React.JSX.Element {
  if (type === 'rag') return <Database className="shrink-0 size-3 text-muted-foreground" />;
  return <Table className="shrink-0 size-3 text-muted-foreground" />;
}

interface StoreCardProps {
  item: SidebarItem;
  active: boolean;
  onRename: (item: SidebarItem) => void;
  onDelete: (item: SidebarItem) => void;
}

function StoreCard({ item, active, onRename, onDelete }: StoreCardProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.storesSidebar');
  function stop(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
  }
  return (
    <div className="group relative">
      <Link
        href={item.href}
        className={`flex items-center gap-2 rounded-md pl-2 pr-7 py-1.5 ${
          active ? 'bg-input/70 text-foreground' : 'hover:bg-input/70 text-foreground'
        }`}
      >
        <StoreIcon type={item.type} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-[10px] font-medium leading-tight">{item.name}</span>
          <span className="truncate font-mono text-[9px] text-muted-foreground/70 leading-tight">
            {item.slug}
          </span>
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('actions')}
              onClick={stop}
              className="absolute right-1 top-1/2 size-5 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
            >
              <MoreHorizontal className="size-3" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onRename(item)} className="cursor-pointer">
            {t('rename')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete(item)}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface StoreListProps {
  items: SidebarItem[];
  pathname: string;
  search: string;
  onRename: (item: SidebarItem) => void;
  onDelete: (item: SidebarItem) => void;
}

function StoreList({ items, pathname, search, onRename, onDelete }: StoreListProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.storesSidebar');
  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  if (items.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-xs text-muted-foreground bg-input/70 mt-1 mx-3 rounded-md">
        {t('empty')}
      </p>
    );
  }

  if (filtered.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-xs text-muted-foreground bg-muted mt-1 mx-3 rounded-md">
        {t('noResults')}
      </p>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5 px-2 mt-1">
      {filtered.map((item) => (
        <StoreCard
          key={item.id}
          item={item}
          active={pathname === item.href}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </nav>
  );
}

interface DeleteDialogProps {
  target: SidebarItem | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteStoreDialog({ target, busy, onCancel, onConfirm }: DeleteDialogProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.delete');
  return (
    <AlertDialog open={target !== null} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={busy} onClick={onConfirm}>
            {t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function StoresSidebar({
  orgId,
  orgSlug,
  initialRagStores,
  initialKvStores,
}: StoresSidebarProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [ragStores, setRagStores] = useState(initialRagStores);
  const [kvStores, setKvStores] = useState(initialKvStores);
  const [renameTarget, setRenameTarget] = useState<SidebarItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SidebarItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleCreate(type: StoreType, name: string): Promise<{ ok: boolean; slug?: string }> {
    if (type === 'rag') {
      const { result } = await createRagStoreAction(orgId, name);
      if (result === null) return { ok: false };
      setRagStores([result, ...ragStores]);
      router.push(`/orgs/${orgSlug}/knowledge-base/rag/${result.slug}`);
      return { ok: true, slug: result.slug };
    }
    const { result } = await createKvStoreAction(orgId, name);
    if (result === null) return { ok: false };
    setKvStores([result, ...kvStores]);
    router.push(`/orgs/${orgSlug}/knowledge-base/kv/${result.slug}`);
    return { ok: true, slug: result.slug };
  }

  async function handleRename(newName: string): Promise<{ ok: boolean }> {
    if (renameTarget === null) return { ok: false };
    const rawId = rawIdOf(renameTarget);
    if (renameTarget.type === 'rag') {
      const { result } = await updateRagStoreAction(rawId, newName);
      if (result === null) return { ok: false };
      setRagStores(ragStores.map((s) => (s.id === rawId ? result : s)));
      return { ok: true };
    }
    const { result } = await updateKvStoreAction(rawId, newName);
    if (result === null) return { ok: false };
    setKvStores(kvStores.map((s) => (s.id === rawId ? result : s)));
    return { ok: true };
  }

  async function handleConfirmDelete(): Promise<void> {
    if (deleteTarget === null) return;
    setDeleting(true);
    const rawId = rawIdOf(deleteTarget);
    if (deleteTarget.type === 'rag') {
      await deleteRagStoreAction(rawId);
      setRagStores(ragStores.filter((s) => s.id !== rawId));
    } else {
      await deleteKvStoreAction(rawId);
      setKvStores(kvStores.filter((s) => s.id !== rawId));
    }
    setDeleting(false);
    const wasViewing = pathname === deleteTarget.href;
    setDeleteTarget(null);
    if (wasViewing) router.push(`/orgs/${orgSlug}/knowledge-base`);
  }

  const items = buildItems(ragStores, kvStores, orgSlug);

  return (
    <aside className="w-[240px] shrink-0 border-r flex flex-col">
      <SidebarHeader onCreateClick={() => setCreateOpen(true)} />
      <SearchInput value={search} onChange={setSearch} />
      <Scrollable className="min-h-0 flex-1">
        <StoreList
          items={items}
          pathname={pathname}
          search={search}
          onRename={setRenameTarget}
          onDelete={setDeleteTarget}
        />
      </Scrollable>
      <CreateStoreDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={handleCreate} />
      <RenameStoreDialog
        open={renameTarget !== null}
        currentName={renameTarget?.name ?? ''}
        currentSlug={renameTarget?.slug ?? ''}
        onOpenChange={(o) => !o && setRenameTarget(null)}
        onSubmit={handleRename}
      />
      <DeleteStoreDialog
        target={deleteTarget}
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </aside>
  );
}
