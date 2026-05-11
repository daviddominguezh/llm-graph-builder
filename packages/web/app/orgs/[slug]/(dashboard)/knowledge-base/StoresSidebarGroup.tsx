'use client';

import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

interface SidebarItem {
  id: string;
  slug: string;
  name: string;
}

interface StoresSidebarGroupProps {
  header: string;
  items: SidebarItem[];
  hrefFor: (slug: string) => string;
  isActiveSlug: (slug: string) => boolean;
  newLabel: string;
  emptyLabel: string;
  onNewClick: () => void;
}

function itemClassName(selected: boolean): string {
  const base =
    'flex items-center gap-2 w-full px-2 py-1.5 rounded-[5px] text-left text-xs transition-colors cursor-pointer';
  const state = selected
    ? 'bg-primary/8 text-primary font-semibold'
    : 'hover:bg-sidebar-accent text-muted-foreground hover:text-foreground';
  return `${base} ${state}`;
}

export function StoresSidebarGroup({
  header,
  items,
  hrefFor,
  isActiveSlug,
  newLabel,
  emptyLabel,
  onNewClick,
}: StoresSidebarGroupProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 pt-1">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
          {header}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          aria-label={newLabel}
          onClick={onNewClick}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      {items.length === 0 ? (
        <span className="px-2 text-[11px] italic text-muted-foreground/60">{emptyLabel}</span>
      ) : (
        items.map((item) => (
          <Link key={item.id} href={hrefFor(item.slug)} className={itemClassName(isActiveSlug(item.slug))}>
            <span className="truncate flex-1">{item.name}</span>
          </Link>
        ))
      )}
    </div>
  );
}
