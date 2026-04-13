'use client';

import { useAgentsSidebar } from '@/app/components/agents/AgentsSidebarContext';
import type { OrgRow } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/client';
import { toProxyImageSrc } from '@/app/lib/supabase/image';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  ChevronsUpDown,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Users,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
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

function NavItem({
  href,
  icon,
  active,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  active: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div className={`group flex flex-col justify-center py-1 ${active ? 'bg-primary/15 rounded-[5px]' : ''}`}>
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-full justify-start px-2 border-x-0 border-y-0 rounded-none ${
          active
            ? 'border-l border-l-2 border-primary bg-transparent text-primary hover:text-primary'
            : 'border-l border-l-2 group-hover:border-foreground text-muted-foreground hover:text-foreground/70 hover:bg-sidebar-accent'
        }`}
        render={<Link href={href} onClick={onClick} />}
      >
        {icon}
      </Button>
    </div>
  );
}

function NavItemExpanded({
  href,
  icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`cursor-pointer group flex flex-col justify-center py-1 rounded-[5px] ${active ? 'bg-primary/15' : 'hover:bg-sidebar-accent'}`}
    >
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-full justify-start gap-2 px-2 text-sm border-x-0 border-y-0 rounded-none ${
          active
            ? 'border-l border-l-2 border-primary bg-transparent hover:bg-transparent! text-primary hover:text-primary'
            : 'border-l border-l-2 group-hover:border-foreground text-muted-foreground hover:text-foreground hover:bg-transparent!'
        }`}
        render={<Link href={href} onClick={onClick} />}
      >
        {icon}
        <span className={`whitespace-nowrap font-normal ${active ? 'font-semibold' : ''}`}>{label}</span>
      </Button>
    </div>
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
    <div className="flex h-8 rounded-md items-center overflow-hidden px-2 hover:bg-sidebar-accent">
      <div className="flex min-w-0 items-center gap-2">
        <OrgAvatar name={org.name} avatarUrl={org.avatar_url} />
        <span className="truncate text-sm font-semibold">{org.name}</span>
      </div>
      <ChevronsUpDown className="text-muted-foreground ml-auto size-3.5 shrink-0" />
    </div>
  );
}

interface NavItemDef {
  segment: string;
  path: string;
  Icon: LucideIcon;
  labelKey: string;
}

const TOP_NAV_ITEMS: NavItemDef[] = [
  { segment: '', path: '', Icon: Zap, labelKey: 'agents' },
  { segment: 'dashboard', path: '/dashboard', Icon: LayoutDashboard, labelKey: 'dashboard' },
  { segment: 'chats', path: '/chats', Icon: MessageSquare, labelKey: 'chats' },
  { segment: 'tenants', path: '/tenants', Icon: Building2, labelKey: 'tenants' },
];

const BOTTOM_NAV_ITEMS: NavItemDef[] = [
  { segment: 'api-keys', path: '/api-keys', Icon: KeyRound, labelKey: 'apiKeys' },
  { segment: 'team', path: '/team', Icon: Users, labelKey: 'team' },
  { segment: 'settings', path: '/settings', Icon: Settings, labelKey: 'settings' },
];

function getActiveSegment(pathname: string, basePath: string): string {
  const rest = pathname.slice(basePath.length);
  const segment = rest.split('/')[1] ?? '';
  if (segment === 'editor') return '';
  return segment;
}

function NavList({
  items,
  basePath,
  segment,
  onItemClick,
}: {
  items: NavItemDef[];
  basePath: string;
  segment: string;
  onItemClick?: (item: NavItemDef, e: React.MouseEvent) => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => (
        <NavItem
          key={item.labelKey}
          href={`${basePath}${item.path}`}
          icon={<item.Icon className="size-4" />}
          active={segment === item.segment}
          onClick={onItemClick ? (e) => onItemClick(item, e) : undefined}
        />
      ))}
    </nav>
  );
}

function NavListExpanded({
  items,
  basePath,
  segment,
  onItemClick,
}: {
  items: NavItemDef[];
  basePath: string;
  segment: string;
  onItemClick?: (item: NavItemDef, e: React.MouseEvent) => void;
}) {
  const t = useTranslations('orgs');

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => (
        <NavItemExpanded
          key={item.labelKey}
          href={`${basePath}${item.path}`}
          icon={<item.Icon className="size-4" />}
          label={t(item.labelKey)}
          active={segment === item.segment}
          onClick={onItemClick ? (e) => onItemClick(item, e) : undefined}
        />
      ))}
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
      className="h-8 w-full rounded-md! justify-start gap-2 px-2 text-muted-foreground hover:text-destructive hover:bg-sidebar-accent!"
      onClick={handleLogout}
    >
      <LogOut className="size-4 shrink-0" />
      {!collapsed && <span className="whitespace-nowrap text-sm font-normal">{t('logout')}</span>}
    </Button>
  );
}

const SIDEBAR_TRANSITION_MS = 100;

function useSidebarState() {
  const [collapsed, setCollapsed] = useState(true);
  const [contentCollapsed, setContentCollapsed] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const isHovered = useRef(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearCollapseTimer() {
    if (collapseTimer.current !== null) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  }

  function collapse() {
    setCollapsed(true);
    collapseTimer.current = setTimeout(() => setContentCollapsed(true), SIDEBAR_TRANSITION_MS);
  }

  function expand() {
    clearCollapseTimer();
    setCollapsed(false);
    setContentCollapsed(false);
  }

  const handleSwitcherChange = (open: boolean) => {
    setSwitcherOpen(open);
    if (!open && !isHovered.current) collapse();
  };

  const handleMouseEnter = () => {
    isHovered.current = true;
    expand();
  };

  const handleMouseLeave = () => {
    isHovered.current = false;
    if (!switcherOpen) collapse();
  };

  return {
    collapsed,
    contentCollapsed,
    switcherOpen,
    handleSwitcherChange,
    handleMouseEnter,
    handleMouseLeave,
  };
}

function useAgentsNavClick(activeSegment: string) {
  const { collapsed, setCollapsed } = useAgentsSidebar();

  return (item: NavItemDef, e: React.MouseEvent) => {
    if (item.segment !== '') return;

    if (collapsed && activeSegment === '') {
      e.preventDefault();
      setCollapsed(false);
    } else {
      setCollapsed(false);
    }
  };
}

export function OrgSidebar({ org }: OrgSidebarProps) {
  const pathname = usePathname();
  const basePath = `/orgs/${org.slug}`;
  const segment = getActiveSegment(pathname, basePath);
  const sidebar = useSidebarState();
  const handleNavClick = useAgentsNavClick(segment);

  return (
    <aside
      className={`absolute left-0 top-0 bottom-0 z-11 flex flex-col gap-2 overflow-hidden p-2 pl-1.5 pt-2.5 pb-8.5 transition-[width,background-color] duration-100 ${sidebar.collapsed ? 'w-[52px] bg-transparent' : 'w-58.5 bg-background'} ${sidebar.contentCollapsed ? 'border border-transparent' : 'shadow-lg border rounded-e-md z-12'}`}
    >
      <OrgSwitcherPopover
        currentOrg={org}
        open={sidebar.switcherOpen}
        onOpenChange={sidebar.handleSwitcherChange}
      >
        {sidebar.contentCollapsed ? <CollapsedTrigger org={org} /> : <ExpandedTrigger org={org} />}
      </OrgSwitcherPopover>
      {sidebar.contentCollapsed ? (
        <NavList items={TOP_NAV_ITEMS} basePath={basePath} segment={segment} onItemClick={handleNavClick} />
      ) : (
        <NavListExpanded
          items={TOP_NAV_ITEMS}
          basePath={basePath}
          segment={segment}
          onItemClick={handleNavClick}
        />
      )}
      <div className="mt-auto flex flex-col gap-2">
        {sidebar.contentCollapsed ? (
          <NavList items={BOTTOM_NAV_ITEMS} basePath={basePath} segment={segment} />
        ) : (
          <NavListExpanded items={BOTTOM_NAV_ITEMS} basePath={basePath} segment={segment} />
        )}
        <Separator />
        <LogoutButton collapsed={sidebar.contentCollapsed} />
      </div>
    </aside>
  );
}
