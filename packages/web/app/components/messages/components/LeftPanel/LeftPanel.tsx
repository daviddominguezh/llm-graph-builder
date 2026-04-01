import { Collaborator } from '@/app/types/projectInnerSettings';
import { useIsMobile } from '@/app/utils/device';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CircleCheck,
  CircleEllipsis,
  Construction,
  Inbox,
  MessagesSquare,
  PanelLeft,
  PanelRight,
  UserRoundX,
  WandSparkles,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useEffect, useMemo, useState } from 'react';

import { ChatWithId } from '../../core/contexts/ChatContext';
import { Slot } from '../../core/slots';

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
}

/**
 * LeftPanel — navigation panel to the left of the chat list.
 * Styled to match the OrgSidebar nav items.
 */
const LeftPanelComponent: React.FC<LeftPanelProps> = ({
  activeFilter,
  onFilterChange,
  onCollapseChange,
  orderedChats = [],
  currentUserEmail = null,
}) => {
  const t = useTranslations('messages');
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  useEffect(() => {
    onCollapseChange?.(isCollapsed);
  }, [isCollapsed, onCollapseChange]);

  const badges = useMemo(() => {
    const getLatestAssignee = (chat: ChatWithId): string | null => {
      if (!chat.assignees) return null;
      const entries = Object.values(chat.assignees);
      if (entries.length === 0) return null;
      return entries.reduce((a, b) => (b.timestamp > a.timestamp ? b : a)).assignee;
    };
    const status = (chat: ChatWithId): string => chat.status || 'open';
    const count = (fn: (c: ChatWithId) => boolean): number =>
      orderedChats.filter(fn).filter((c) => !c.enabled).filter((c) => c.message?.role === 'user').length;

    return {
      inbox: count((c) => getLatestAssignee(c) === currentUserEmail),
      withBot: count((c) => c.enabled === true),
      unassigned: count((c) => {
        const a = getLatestAssignee(c);
        return (!a || a === 'unassigned' || a === 'none') && !c.enabled;
      }),
      open: count((c) => status(c) === 'open' || status(c) === 'verify-payment'),
      blocked: count((c) => status(c) === 'blocked'),
      closed: count((c) => status(c) === 'closed'),
      all: count(() => true),
    };
  }, [orderedChats, currentUserEmail]);

  if (isMobile) return null;

  const allItems: SectionItem[] = [
    { id: 'inbox', label: t('Your inbox'), icon: <Inbox className="size-4" />, badge: badges.inbox },
    { id: 'with-bot', label: t('With bot'), icon: <WandSparkles className="size-4" />, badge: badges.withBot },
    {
      id: 'unassigned',
      label: t('Unassigned'),
      icon: <UserRoundX className="size-4" />,
      badge: badges.unassigned,
    },
    { id: 'open', label: t('Opened'), icon: <CircleEllipsis className="size-4" />, badge: badges.open },
    { id: 'blocked', label: t('Blocked'), icon: <Construction className="size-4" />, badge: badges.blocked },
    { id: 'closed', label: t('Closed'), icon: <CircleCheck className="size-4" />, badge: badges.closed },
    { id: 'all', label: t('All'), icon: <MessagesSquare className="size-4" />, badge: badges.all },
  ];

  return (
    <div className="relative flex flex-col h-full w-full bg-white border-r border-gray-200 overflow-y-auto">
      <Slot name="left-panel-top" />

      <div
        className={`flex w-full items-center py-1.5 ${
          isCollapsed ? 'justify-center px-2' : 'justify-between pl-3 pr-1 border-b mb-2.5'
        }`}
      >
        {!isCollapsed && <div className="cursor-default text-sm font-semibold">{t('Inbox')}</div>}
        <Button variant="ghost" className="cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
          {isCollapsed ? <PanelRight className="size-4" /> : <PanelLeft className="size-4" />}
        </Button>
      </div>

      <div className={`flex flex-col ${isCollapsed ? 'px-2' : 'px-3'}`}>
        {allItems.map((item) => (
          <NavItemRow
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeFilter === item.id}
            collapsed={isCollapsed}
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
  collapsed,
  badge,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  active: boolean;
  collapsed: boolean;
  badge?: number;
  onClick: () => void;
}) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <div className={`group flex flex-col justify-center py-1 ${active ? 'bg-primary/15 rounded-[5px]' : ''}`}>
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 w-full justify-center px-2 border-x-0 border-y-0 rounded-none relative cursor-pointer ${
                active
                  ? 'border-l border-l-2 border-primary bg-transparent text-primary hover:text-primary'
                  : 'border-l border-l-2 group-hover:border-foreground text-muted-foreground hover:text-foreground/70 hover:bg-sidebar-accent'
              }`}
              onClick={onClick}
            >
              {icon}
              {badge !== undefined && badge > 0 && (
                <Badge className="absolute -top-1 -right-1 h-3.5 min-w-3.5 rounded-full px-0.5 text-[9px] bg-red-500 flex items-center justify-center">
                  {badge}
                </Badge>
              )}
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

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
