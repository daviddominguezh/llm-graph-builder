import type { TenantRow } from '@/app/lib/tenants';
import { Collaborator } from '@/app/types/projectInnerSettings';
import { useIsMobile } from '@/app/utils/device';
import { Button } from '@/components/ui/button';
import { CircleAlert, CircleCheck, Inbox, Loader, MessagesSquare, UserRoundX, Zap } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { memo, useMemo } from 'react';

import { ChatWithId } from '../../core/contexts/ChatContext';
import { useUI } from '../../core/contexts/UIContext';
import { Slot } from '../../core/slots';
import type { AgentOption } from '../ChatListPanel/AgentFilterCombobox';
import { TenantSwitcher } from '../TenantSwitcher';
import { ExportCsvButton } from './ExportCsvButton';

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
  // TODO: source agents list from parent (MessagesDashboardLayout)
  agents?: AgentOption[];
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
  agents = [],
}) => {
  const t = useTranslations('messages');
  const isMobile = useIsMobile();
  const params = useParams<{ slug?: string }>();
  const orgSlug = params?.slug ?? '';
  const { agentFilter } = useUI();
  const tenantSlug = tenants.find((tn) => tn.id === currentTenantId)?.slug ?? '';

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
    { id: 'all', label: t('All'), icon: <MessagesSquare className="size-4" />, badge: badges.all },
    { id: 'inbox', label: t('Your inbox'), icon: <Inbox className="size-4" />, badge: badges.inbox },
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
      {currentTenantId !== '' && (
        <div className="px-2 pb-2">
          <ExportCsvButton
            tenantId={currentTenantId}
            tenantSlug={tenantSlug}
            orgSlug={orgSlug}
            agents={agents}
            defaultAgentId={agentFilter}
          />
        </div>
      )}
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
      className={`cursor-pointer group flex flex-col justify-center py-1 rounded-[5px] ${active ? 'bg-primary/8' : 'hover:bg-primary/8'}`}
    >
      <Button
        variant="ghost"
        size="sm"
        className={`h-6 w-full justify-start gap-2 px-2 text-sm border-x-0 border-y-0 rounded-none cursor-pointer ${
          active
            ? 'border-l border-l-2 border-transparent bg-transparent hover:bg-transparent! text-primary hover:text-primary'
            : 'border-l border-l-2 border-transparent text-muted-foreground group-hover:text-foreground hover:bg-transparent!'
        }`}
        onClick={onClick}
      >
        {icon}
        <span className={`whitespace-nowrap text-xs font-medium flex-1 text-left ${active ? 'font-semibold' : ''}`}>
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
