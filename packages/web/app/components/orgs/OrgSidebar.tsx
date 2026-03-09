'use client';

import type { OrgRow } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { ChevronsUpDown, LogOut, Settings, Zap } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { OrgSwitcherPopover } from './OrgSwitcherPopover';

interface OrgSidebarProps {
  org: OrgRow;
}

function OrgAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl !== null) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={24}
        height={24}
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
      {initial}
    </div>
  );
}

function NavItem({ href, icon, active }: { href: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-8 w-full justify-start px-2 ${
        active ? 'bg-black/[0.04] text-foreground' : 'text-muted-foreground hover:text-foreground/70'
      }`}
      render={<Link href={href} />}
    >
      {icon}
    </Button>
  );
}

function NavItemExpanded({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-8 w-full justify-start gap-2 px-2 text-sm ${
        active ? 'bg-black/[0.04] text-foreground' : 'text-muted-foreground hover:text-foreground/70'
      }`}
      render={<Link href={href} />}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </Button>
  );
}

function CollapsedTrigger({ org }: { org: OrgRow }) {
  return (
    <div className="flex h-8 items-center justify-center">
      <OrgAvatar name={org.name} avatarUrl={org.avatar_url} />
    </div>
  );
}

function ExpandedTrigger({ org }: { org: OrgRow }) {
  return (
    <div className="flex h-8 items-center overflow-hidden">
      <div className="flex min-w-0 items-center gap-2">
        <OrgAvatar name={org.name} avatarUrl={org.avatar_url} />
        <span className="truncate text-sm font-semibold">{org.name}</span>
      </div>
      <ChevronsUpDown className="text-muted-foreground ml-auto size-3.5 shrink-0" />
    </div>
  );
}

function CollapsedNav({ basePath, isSettings }: { basePath: string; isSettings: boolean }) {
  return (
    <nav className="flex flex-col gap-0.5">
      <NavItem href={basePath} icon={<Zap className="size-4" />} active={!isSettings} />
      <NavItem href={`${basePath}/settings`} icon={<Settings className="size-4" />} active={isSettings} />
    </nav>
  );
}

function ExpandedNav({ basePath, isSettings }: { basePath: string; isSettings: boolean }) {
  const t = useTranslations('orgs');

  return (
    <nav className="flex flex-col gap-0.5">
      <NavItemExpanded href={basePath} icon={<Zap className="size-4" />} label={t('agents')} active={!isSettings} />
      <NavItemExpanded
        href={`${basePath}/settings`}
        icon={<Settings className="size-4" />}
        label={t('settings')}
        active={isSettings}
      />
    </nav>
  );
}

function useLogout() {
  const router = useRouter();

  return async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };
}

function LogoutButton({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations('common');
  const handleLogout = useLogout();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-full justify-start gap-2 px-2 text-muted-foreground hover:text-destructive"
      onClick={handleLogout}
    >
      <LogOut className="size-4 shrink-0" />
      {!collapsed && <span className="whitespace-nowrap text-sm">{t('logout')}</span>}
    </Button>
  );
}

function useSidebarState() {
  const [collapsed, setCollapsed] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const isHovered = useRef(false);

  const handleSwitcherChange = (open: boolean) => {
    setSwitcherOpen(open);
    if (!open && !isHovered.current) setCollapsed(true);
  };

  const handleMouseEnter = () => {
    isHovered.current = true;
    setCollapsed(false);
  };

  const handleMouseLeave = () => {
    isHovered.current = false;
    if (!switcherOpen) setCollapsed(true);
  };

  return { collapsed, switcherOpen, handleSwitcherChange, handleMouseEnter, handleMouseLeave };
}

export function OrgSidebar({ org }: OrgSidebarProps) {
  const pathname = usePathname();
  const basePath = `/orgs/${org.slug}`;
  const isSettings = pathname.endsWith('/settings');
  const sidebar = useSidebarState();

  return (
    <aside
      className={`absolute left-2 top-2 bottom-2 z-10 flex flex-col gap-4 rounded-xl border bg-background p-2 shadow-sm transition-[width] duration-100 ${sidebar.collapsed ? 'w-13' : 'w-48 shadow-lg'}`}
      onMouseEnter={sidebar.handleMouseEnter}
      onMouseLeave={sidebar.handleMouseLeave}
    >
      <OrgSwitcherPopover currentOrg={org} open={sidebar.switcherOpen} onOpenChange={sidebar.handleSwitcherChange}>
        {sidebar.collapsed ? <CollapsedTrigger org={org} /> : <ExpandedTrigger org={org} />}
      </OrgSwitcherPopover>
      {sidebar.collapsed ? (
        <CollapsedNav basePath={basePath} isSettings={isSettings} />
      ) : (
        <ExpandedNav basePath={basePath} isSettings={isSettings} />
      )}
      <div className="mt-auto">
        <LogoutButton collapsed={sidebar.collapsed} />
      </div>
    </aside>
  );
}
