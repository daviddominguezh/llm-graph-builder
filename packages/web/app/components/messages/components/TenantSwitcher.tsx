'use client';

import { toProxyImageSrc } from '@/app/lib/supabase/image';
import type { TenantRow } from '@/app/lib/tenants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, ChevronsUpDown } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface TenantSwitcherProps {
  tenants: TenantRow[];
  currentTenantId: string;
  onTenantChange: (tenantId: string) => void;
}

function TenantAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return (
      <Image
        src={toProxyImageSrc(avatarUrl)}
        alt={name}
        width={20}
        height={20}
        className="h-5 w-5 shrink-0 rounded-full object-cover border"
      />
    );
  }

  return (
    <div className="bg-muted flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium border">
      {initial}
    </div>
  );
}

function SingleTenantLabel({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div className="flex h-8 rounded-md items-center overflow-hidden px-2">
      <div className="flex min-w-0 items-center gap-2">
        <TenantAvatar name={name} avatarUrl={avatarUrl} />
        <span className="truncate text-xs font-semibold">{name}</span>
      </div>
    </div>
  );
}

function MultiTenantTriggerContent({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div className="flex h-8 rounded-md items-center overflow-hidden px-2 hover:bg-sidebar-accent w-full">
      <div className="flex min-w-0 items-center gap-2 flex-1">
        <TenantAvatar name={name} avatarUrl={avatarUrl} />
        <span className="truncate text-xs font-semibold">{name}</span>
      </div>
      <ChevronsUpDown className="text-muted-foreground ml-auto size-3.5 shrink-0" />
    </div>
  );
}

export function TenantSwitcher({ tenants, currentTenantId, onTenantChange }: TenantSwitcherProps) {
  const t = useTranslations('messages');
  const [open, setOpen] = useState(false);

  const currentTenant = tenants.find((tenant) => tenant.id === currentTenantId);
  const currentName = currentTenant?.name ?? t('Unknown');
  const currentAvatar = currentTenant?.avatar_url ?? null;

  if (tenants.length <= 1) {
    return <SingleTenantLabel name={currentName} avatarUrl={currentAvatar} />;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger className="w-full cursor-pointer">
        <MultiTenantTriggerContent name={currentName} avatarUrl={currentAvatar} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="w-46">
        <DropdownMenuGroup>
          {tenants.map((tenant) => (
            <DropdownMenuItem
              key={tenant.id}
              onClick={() => {
                onTenantChange(tenant.id);
                setOpen(false);
              }}
            >
              <TenantAvatar name={tenant.name} avatarUrl={tenant.avatar_url} />
              <span className="flex-1 truncate">{tenant.name}</span>
              {tenant.id === currentTenantId && <Check className="ml-auto size-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
