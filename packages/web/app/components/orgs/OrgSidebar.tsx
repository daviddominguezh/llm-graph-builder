'use client';

import type { OrgRow } from '@/app/lib/orgs';
import { ChevronLeft, Settings, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface OrgSidebarProps {
  org: OrgRow;
}

function OrgAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return <img src={avatarUrl} alt={name} className="h-6 w-6 rounded-full object-cover" />;
  }

  return (
    <div className="bg-muted flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium">
      {initial}
    </div>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-all ${
        active
          ? 'bg-black/[0.04] text-foreground'
          : 'text-muted-foreground hover:text-foreground/70'
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}

export function OrgSidebar({ org }: OrgSidebarProps) {
  const t = useTranslations('orgs');
  const pathname = usePathname();
  const basePath = `/orgs/${org.slug}`;
  const isSettings = pathname.endsWith('/settings');

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-4 border-r p-4">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="size-4" />
        </Link>
        <OrgAvatar name={org.name} avatarUrl={org.avatar_url} />
        <span className="truncate text-sm font-semibold">{org.name}</span>
      </div>
      <nav className="flex flex-col gap-0.5">
        <NavItem href={basePath} icon={<Zap className="size-4" />} label={t('agents')} active={!isSettings} />
        <NavItem
          href={`${basePath}/settings`}
          icon={<Settings className="size-4" />}
          label={t('settings')}
          active={isSettings}
        />
      </nav>
    </aside>
  );
}
