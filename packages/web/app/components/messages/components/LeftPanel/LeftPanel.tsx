import type { TenantRow } from '@/app/lib/tenants';
import { Collaborator } from '@/app/types/projectInnerSettings';
import { useIsMobile } from '@/app/utils/device';
import { Button } from '@/components/ui/button';
import { CircleAlert, CircleCheck, Inbox, Loader, MessagesSquare, UserRoundX, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';

import { ChatWithId } from '../../core/contexts/ChatContext';
import { Slot } from '../../core/slots';
import { TenantSwitcher } from '../TenantSwitcher';

interface SectionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

interface LeftPanelProps {
  projectName?: string;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  onCollapseChange?: (isCollapsed: boolean) => void;
  collaborators?: Collaborator[];
  profilePictures?: Map<string, string>;
  orderedChats?: ChatWithId[];
  currentUserEmail?: string | null;
  tenants: TenantRow[];
  currentTenantId: string;
  onTenantChange: (tenantId: string) => void;
}

/**
 * LeftPanel — navigation panel to the left of the chat list.
 * Styled to match the OrgSidebar nav items.
 */
const LeftPanelComponent: React.FC<LeftPanelProps> = ({
  activeFilter,
  onFilterChange,
  orderedChats = [],
  currentUserEmail = null,
  tenants,
  currentTenantId,
  onTenantChange,
}) => {
  const t = useTranslations('messages');
  const isMobile = useIsMobile();

  const badges = useMemo(() => {
    const getLatestAssignee = (chat: ChatWithId): string | null => {
      if (!chat.assignees) return null;
      const entries = Object.values(chat.assignees);
      if (entries.length === 0) return null;
      return entries.reduce((a, b) => (b.timestamp > a.timestamp ? b : a)).assignee;
    };
    const status = (chat: ChatWithId): string => {
      if (chat.status) return chat.status;
      if (chat.statuses) {
        const entries = Object.values(chat.statuses);
        if (entries.length > 0) {
          return entries.reduce((a, b) => (b.timestamp > a.timestamp ? b : a)).status;
        }
      }
      return 'open';
    };
    const count = (fn: (c: ChatWithId) => boolean): number =>
      orderedChats
        .filter(fn)
        .filter((c) => !c.enabled)
        .filter((c) => c.message?.role === 'user').length;

    return {
      inbox: count((c) => getLatestAssignee(c) === currentUserEmail),
      withBot: count((c) => c.enabled === true),
      unassigned: count((c) => {
        const a = getLatestAssignee(c);
        return (!a || a === 'unassigned' || a === 'none') && !c.enabled;
      }),
      open: count((c) => status(c) === 'open'),
      blocked: count((c) => status(c) === 'blocked'),
      closed: count((c) => status(c) === 'closed'),
      all: count(() => true),
    };
  }, [orderedChats, currentUserEmail]);

  if (isMobile) return null;

  const allItems: SectionItem[] = [
    { id: 'inbox', label: t('Your inbox'), icon: <Inbox className="size-4" />, badge: badges.inbox },
    { id: 'all', label: t('All'), icon: <MessagesSquare className="size-4" />, badge: badges.all },
    {
      id: 'with-bot',
      label: t('With agent'),
      icon: <Zap className="size-4" />,
      badge: badges.withBot,
    },
    {
      id: 'unassigned',
      label: t('Unassigned'),
      icon: <UserRoundX className="size-4" />,
      badge: badges.unassigned,
    },
    { id: 'open', label: t('Opened'), icon: <Loader className="size-4" />, badge: badges.open },
    { id: 'blocked', label: t('Blocked'), icon: <CircleAlert className="size-4" />, badge: badges.blocked },
    { id: 'closed', label: t('Closed'), icon: <CircleCheck className="size-4" />, badge: badges.closed },
  ];

  return (
    <div className="relative flex flex-col h-full w-full bg-background border-r overflow-y-auto">
      <Slot name="left-panel-top" />

      <div className="h-[41px] flex w-full items-center py-1.5 pl-1 pr-1 border-b mb-2.5">
        <TenantSwitcher tenants={tenants} currentTenantId={currentTenantId} onTenantChange={onTenantChange} />
      </div>

      <div className={`flex flex-col px-2 gap-0.5`}>
        {allItems.map((item) => (
          <NavItemRow
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeFilter === item.id}
            badge={item.badge}
            onClick={() => onFilterChange(item.id)}
          />
        ))}
      </div>

      <div className="flex-grow" />
      <Slot name="left-panel-bottom" />
    </div>
  );
};

/** Single nav row matching OrgSidebar NavItem / NavItemExpanded style. */
function NavItemRow({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <div
      className={`cursor-pointer group flex flex-col justify-center py-1 rounded-[5px] ${active ? 'bg-primary/15' : 'hover:bg-sidebar-accent'}`}
    >
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-full justify-start gap-2 px-2 text-sm border-x-0 border-y-0 rounded-none cursor-pointer ${
          active
            ? 'border-l border-l-2 border-primary bg-transparent hover:bg-transparent! text-primary hover:text-primary'
            : 'border-l border-l-2 group-hover:border-foreground text-muted-foreground hover:text-foreground hover:bg-transparent!'
        }`}
        onClick={onClick}
      >
        {icon}
        <span className={`whitespace-nowrap font-normal flex-1 text-left ${active ? 'font-semibold' : ''}`}>
          {label}
        </span>
        {badge !== undefined && badge > 0 && (
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{badge}</span>
        )}
      </Button>
    </div>
  );
}

export const LeftPanel = memo(LeftPanelComponent);
LeftPanel.displayName = 'LeftPanel';
