'use client';

import { useAgentsSidebar } from '@/app/components/agents/AgentsSidebarContext';
import type { OrgRow } from '@/app/lib/orgs';
import { createClient } from '@/app/lib/supabase/client';
import { toProxyImageSrc } from '@/app/lib/supabase/image';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { LucideIcon } from 'lucide-react';
import { ChevronsUpDown, KeyRound, LayoutDashboard, LogOut, MessageSquare, ScrollText, Settings, Users, Zap } from 'lucide-react';
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
        src={toProxyImageSrc(avatarUrl)}
        alt={name}
        width={20}
        height={20}
        className="h-5 w-5 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="bg-muted flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium">
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
    <Button
      variant="ghost"
      size="sm"
      className={`h-8 w-full justify-start px-2 border ${
        active
          ? 'border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary'
          : 'border-background text-muted-foreground hover:text-foreground/70'
      }`}
      render={<Link href={href} onClick={onClick} />}
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
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-8 w-full justify-start gap-2 px-2 text-sm border ${
        active
          ? 'border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary'
          : 'border-background text-muted-foreground hover:text-foreground/70'
      }`}
      render={<Link href={href} onClick={onClick} />}
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
    <div className="flex h-8 items-center overflow-hidden px-2">
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
];

const BOTTOM_NAV_ITEMS: NavItemDef[] = [
  { segment: 'api-keys', path: '/api-keys', Icon: KeyRound, labelKey: 'apiKeys' },
  { segment: 'logs', path: '/logs', Icon: ScrollText, labelKey: 'logs' },
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
      className={`absolute left-1.5 top-1.5 bottom-1.5 z-10 flex flex-col gap-4 rounded-xl border bg-background p-2 transition-[width] duration-100 ${sidebar.collapsed ? 'w-13' : 'w-74 shadow-lg'}`}
      onMouseEnter={sidebar.handleMouseEnter}
      onMouseLeave={sidebar.handleMouseLeave}
    >
      <OrgSwitcherPopover currentOrg={org} open={sidebar.switcherOpen} onOpenChange={sidebar.handleSwitcherChange}>
        {sidebar.collapsed ? <CollapsedTrigger org={org} /> : <ExpandedTrigger org={org} />}
      </OrgSwitcherPopover>
      {sidebar.collapsed ? (
        <NavList items={TOP_NAV_ITEMS} basePath={basePath} segment={segment} onItemClick={handleNavClick} />
      ) : (
        <NavListExpanded items={TOP_NAV_ITEMS} basePath={basePath} segment={segment} onItemClick={handleNavClick} />
      )}
      <div className="mt-auto flex flex-col gap-2">
        {sidebar.collapsed ? (
          <NavList items={BOTTOM_NAV_ITEMS} basePath={basePath} segment={segment} />
        ) : (
          <NavListExpanded items={BOTTOM_NAV_ITEMS} basePath={basePath} segment={segment} />
        )}
        <Separator />
        <LogoutButton collapsed={sidebar.collapsed} />
      </div>
    </aside>
  );
}
