'use client';

import { Scrollable } from '@/app/components/Scrollable';
import { toProxyImageSrc } from '@/app/lib/supabase/image';
import type { TenantRow } from '@/app/lib/tenants';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

interface TenantListProps {
  tenants: TenantRow[];
  currentTenantId: string;
  onSelect: (id: string) => void;
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }): React.JSX.Element {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  if (avatarUrl !== null) {
    return (
      <Image
        src={toProxyImageSrc(avatarUrl)}
        alt={name}
        width={20}
        height={20}
        className="size-5 shrink-0 rounded-full object-cover border border-input"
      />
    );
  }
  return (
    <div className="bg-muted text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium border">
      {initial}
    </div>
  );
}

function itemClassName(selected: boolean): string {
  const base =
    'flex items-center gap-2 w-full px-2 py-1.5 rounded-[5px] text-left text-xs transition-colors cursor-pointer';
  const state = selected
    ? 'bg-primary/8 text-primary font-semibold'
    : 'hover:bg-sidebar-accent text-muted-foreground hover:text-foreground';
  return `${base} ${state}`;
}

interface ItemProps {
  tenant: TenantRow;
  selected: boolean;
  onClick: () => void;
}

function Item({ tenant, selected, onClick }: ItemProps): React.JSX.Element {
  return (
    <button type="button" className={itemClassName(selected)} onClick={onClick}>
      <Avatar name={tenant.name} avatarUrl={tenant.avatar_url} />
      <span className="truncate flex-1">{tenant.name}</span>
    </button>
  );
}

export function TenantList({
  tenants,
  currentTenantId,
  onSelect,
}: TenantListProps): React.JSX.Element {
  const t = useTranslations('knowledgeBase.tenantList');
  return (
    <aside className="w-56 shrink-0 border-r flex flex-col">
      <div className="px-3 pt-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
          {t('label')}
        </span>
      </div>
      <Scrollable className="min-h-0 flex-1">
        <div className="p-2 flex flex-col gap-0.5">
          {tenants.map((tenant) => (
            <Item
              key={tenant.id}
              tenant={tenant}
              selected={tenant.id === currentTenantId}
              onClick={() => onSelect(tenant.id)}
            />
          ))}
        </div>
      </Scrollable>
    </aside>
  );
}
