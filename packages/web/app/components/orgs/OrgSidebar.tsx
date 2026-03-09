'use client';

import type { OrgRow } from '@/app/lib/orgs';
import { ChevronLeft, Settings, Zap } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface OrgSidebarProps {
  org: OrgRow;
}

function OrgAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return <Image src={avatarUrl} alt={name} width={24} height={24} className="h-6 w-6 shrink-0 rounded-full object-cover" />;
  }

  return (
    <div className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
      {initial}
    </div>
  );
}

function NavItem({ href, icon, active }: { href: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex h-8 items-center px-2 rounded-md transition-colors ${
        active
          ? 'bg-black/[0.04] text-foreground'
          : 'text-muted-foreground hover:text-foreground/70'
      }`}
    >
      <span className={`shrink-0 ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{icon}</span>
    </Link>
  );
}

function NavItemExpanded({ href, icon, label, active }: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex h-8 items-center gap-2 rounded-md px-2 text-sm whitespace-nowrap transition-colors ${
        active
          ? 'bg-black/[0.04] text-foreground'
          : 'text-muted-foreground hover:text-foreground/70'
      }`}
    >
      <span className={`shrink-0 ${active ? 'text-foreground' : 'text-muted-foreground'}`}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function CollapsedSidebar({ org, basePath, isSettings }: {
  org: OrgRow;
  basePath: string;
  isSettings: boolean;
}) {
  return (
    <>
      <div className="flex h-8 items-center justify-center">
        <OrgAvatar name={org.name} avatarUrl={org.avatar_url} />
      </div>
      <nav className="flex flex-col gap-0.5">
        <NavItem href={basePath} icon={<Zap className="size-4" />} active={!isSettings} />
        <NavItem href={`${basePath}/settings`} icon={<Settings className="size-4" />} active={isSettings} />
      </nav>
    </>
  );
}

function ExpandedSidebar({ org, basePath, isSettings }: {
  org: OrgRow;
  basePath: string;
  isSettings: boolean;
}) {
  const t = useTranslations('orgs');

  return (
    <>
      <div className="flex h-8 items-center gap-2 overflow-hidden">
        <Link href="/" className="text-muted-foreground hover:text-foreground shrink-0 transition-colors">
          <ChevronLeft className="size-4" />
        </Link>
        <OrgAvatar name={org.name} avatarUrl={org.avatar_url} />
        <span className="truncate text-sm font-semibold">{org.name}</span>
      </div>
      <nav className="flex flex-col gap-0.5">
        <NavItemExpanded href={basePath} icon={<Zap className="size-4" />} label={t('agents')} active={!isSettings} />
        <NavItemExpanded
          href={`${basePath}/settings`}
          icon={<Settings className="size-4" />}
          label={t('settings')}
          active={isSettings}
        />
      </nav>
    </>
  );
}

export function OrgSidebar({ org }: OrgSidebarProps) {
  const pathname = usePathname();
  const basePath = `/orgs/${org.slug}`;
  const isSettings = pathname.endsWith('/settings');
  const [collapsed, setCollapsed] = useState(true);

  return (
    <aside
      className={`absolute left-2 top-2 bottom-2 z-10 flex flex-col gap-4 rounded-xl border bg-background p-2 shadow-sm transition-[width] duration-200 ${collapsed ? 'w-13' : 'w-48 shadow-lg'}`}
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
    >
      {collapsed ? (
        <CollapsedSidebar org={org} basePath={basePath} isSettings={isSettings} />
      ) : (
        <ExpandedSidebar org={org} basePath={basePath} isSettings={isSettings} />
      )}
    </aside>
  );
}
