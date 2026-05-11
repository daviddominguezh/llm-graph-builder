'use client';

import { createKvStoreAction } from '@/app/actions/kvStores';
import { createRagStoreAction } from '@/app/actions/ragStores';
import { Scrollable } from '@/app/components/Scrollable';
import type { KvStoreRow } from '@/app/lib/kvStores';
import type { RagStoreRow } from '@/app/lib/ragStores';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Database, KeyRound, Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { CreateStoreDialog, type StoreType } from './CreateStoreDialog';

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

function SidebarHeader({ onCreateClick }: { onCreateClick: (type: StoreType) => void }): React.JSX.Element {
  const t = useTranslations('knowledgeBase.storesSidebar');
  return (
    <div className="flex items-center justify-between pl-3 pr-1 py-1.5 pb-[calc(0px+var(--spacing)*1.5)] border-b border-b-[0.5px] mb-2.5">
      <h2 className="mt-[1px] font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
        {t('title').toUpperCase()}
      </h2>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="xs" className="aspect-square p-0! h-5 rounded-full">
              <Plus />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onCreateClick('rag')} className="cursor-pointer">
            <Database className="size-3.5" />
            {t('newRag')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onCreateClick('kv')} className="cursor-pointer">
            <KeyRound className="size-3.5" />
            {t('newKv')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }): React.JSX.Element {
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
  return <KeyRound className="shrink-0 size-3 text-muted-foreground" />;
}

function StoreCard({ item, active }: { item: SidebarItem; active: boolean }): React.JSX.Element {
  return (
    <Link
      href={item.href}
      className={`group flex items-center gap-2 rounded-md pl-2 pr-2 py-1.5 ${
        active ? 'bg-input/70 text-foreground' : 'hover:bg-input/70 text-foreground'
      }`}
    >
      <StoreIcon type={item.type} />
      <span className="flex-1 min-w-0 truncate text-[10px] font-medium font-mono">{item.name}</span>
    </Link>
  );
}

interface StoreListProps {
  items: SidebarItem[];
  pathname: string;
  search: string;
}

function StoreList({ items, pathname, search }: StoreListProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.storesSidebar');
  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  if (items.length === 0) {
    return (
      <p className="px-3 py-4 text-center text-xs text-muted-foreground bg-input/20 dark:bg-input/30 mt-1 mx-3 rounded-md">
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
    <nav className="flex flex-col gap-1.5 px-2 mt-1">
      {filtered.map((item) => (
        <StoreCard key={item.id} item={item} active={pathname === item.href} />
      ))}
    </nav>
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
  const [openType, setOpenType] = useState<StoreType | null>(null);
  const [search, setSearch] = useState('');
  const [ragStores, setRagStores] = useState(initialRagStores);
  const [kvStores, setKvStores] = useState(initialKvStores);

  async function handleCreate(name: string): Promise<{ ok: boolean; slug?: string }> {
    if (openType === 'rag') {
      const { result } = await createRagStoreAction(orgId, name);
      if (result === null) return { ok: false };
      setRagStores([result, ...ragStores]);
      router.push(`/orgs/${orgSlug}/knowledge-base/rag/${result.slug}`);
      return { ok: true, slug: result.slug };
    }
    if (openType === 'kv') {
      const { result } = await createKvStoreAction(orgId, name);
      if (result === null) return { ok: false };
      setKvStores([result, ...kvStores]);
      router.push(`/orgs/${orgSlug}/knowledge-base/kv/${result.slug}`);
      return { ok: true, slug: result.slug };
    }
    return { ok: false };
  }

  const items = buildItems(ragStores, kvStores, orgSlug);

  return (
    <aside className="w-[240px] shrink-0 border-r flex flex-col">
      <SidebarHeader onCreateClick={setOpenType} />
      <SearchInput value={search} onChange={setSearch} />
      <Scrollable className="min-h-0 flex-1">
        <StoreList items={items} pathname={pathname} search={search} />
      </Scrollable>
      <CreateStoreDialog
        type={openType ?? 'rag'}
        open={openType !== null}
        onOpenChange={(o) => {
          if (!o) setOpenType(null);
        }}
        onCreate={handleCreate}
      />
    </aside>
  );
}
