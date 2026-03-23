'use client';

import { getOrgsAction } from '@/app/actions/orgs';
import type { OrgRow, OrgWithAgentCount } from '@/app/lib/orgs';
import { toProxyImageSrc } from '@/app/lib/supabase/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, Plus } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState, useTransition } from 'react';

import { CreateOrgDialog } from './CreateOrgDialog';

interface OrgSwitcherPopoverProps {
  currentOrg: OrgRow;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ListAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return (
      <Image
        src={toProxyImageSrc(avatarUrl)}
        alt={name}
        width={20}
        height={20}
        className="h-5 w-5 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div
      className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
      style={{ color: 'var(--color-foreground)' }}
    >
      {initial}
    </div>
  );
}

function useOrgList(open: boolean) {
  const [orgs, setOrgs] = useState<OrgWithAgentCount[]>([]);
  const [, startTransition] = useTransition();

  const fetchOrgs = useCallback(() => {
    startTransition(async () => {
      const { result } = await getOrgsAction();
      setOrgs(result);
    });
  }, [startTransition]);

  useEffect(() => {
    if (open) fetchOrgs();
  }, [open, fetchOrgs]);

  return orgs;
}

export function OrgSwitcherPopover({ currentOrg, children, open, onOpenChange }: OrgSwitcherPopoverProps) {
  const t = useTranslations('orgs');
  const router = useRouter();
  const orgs = useOrgList(open);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCreate = () => {
    onOpenChange(false);
    setDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger className="w-full cursor-pointer">{children}</DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" className="w-69.5">
          <DropdownMenuGroup>
            {orgs.map((org) => (
              <DropdownMenuItem key={org.id} onClick={() => router.push(`/orgs/${org.slug}`)}>
                <ListAvatar name={org.name} avatarUrl={org.avatar_url} />
                <span className="flex-1 truncate">{org.name}</span>
                {org.id === currentOrg.id && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCreate}>
            <Plus className="size-4" />
            {t('create')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrgDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
