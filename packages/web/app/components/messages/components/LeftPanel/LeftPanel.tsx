import { Collaborator } from '@/app/types/projectInnerSettings';
import { useIsMobile } from '@/app/utils/device';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChevronDown,
  ChevronRight,
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
import React, { memo, useEffect, useMemo, useState } from 'react';

import { ChatWithId } from '../../core/contexts/ChatContext';
import { Slot } from '../../core/slots';

interface SectionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

interface Section {
  id: string;
  label: string;
  items?: SectionItem[];
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['chats']));
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

  const sections: Section[] = [
    {
      id: 'chats',
      label: t('Chats'),
      items: [
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
      ],
    },
  ];

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  return (
    <div className="relative flex flex-col h-full w-full bg-white border-r border-gray-200 overflow-y-auto">
      <Slot name="left-panel-top" />

      {/* Header: title + collapse toggle */}
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-2'} mb-1`}>
        {!isCollapsed && <span className="text-sm font-semibold">{t('Inbox')}</span>}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? <PanelRight className="size-4" /> : <PanelLeft className="size-4" />}
        </Button>
      </div>

      <Separator className="mb-2" />

      {/* Inbox item */}
      <nav className="flex flex-col gap-0.5">
        <NavItemRow
          icon={<Inbox className="size-4" />}
          label={t('Your inbox')}
          active={activeFilter === 'inbox'}
          collapsed={isCollapsed}
          badge={badges.inbox}
          onClick={() => onFilterChange('inbox')}
        />
      </nav>

      <Separator className="my-2" />

      {/* Sections */}
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-0.5">
          {/* Section header (expanded only) */}
          {!isCollapsed && (
            <button
              className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-muted-foreground cursor-pointer"
              onClick={() => toggleSection(section.id)}
            >
              {expandedSections.has(section.id) ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              {section.label}
            </button>
          )}

          {/* Section items */}
          {section.items && (isCollapsed || expandedSections.has(section.id)) && (
            <nav className="flex flex-col gap-0.5">
              {section.items.map((item) => (
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
            </nav>
          )}
        </div>
      ))}

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
