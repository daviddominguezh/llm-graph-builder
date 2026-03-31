
import React, { memo, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

// import Avatar from 'react-nice-avatar';

import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleEllipsis,
  Construction,
  FlaskConical,
  // Hash,
  Inbox,
  MessagesSquare,
  PanelLeft,
  PanelRight,
  UserRoundX,
  WandSparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// import { generateAvatarConfig } from '@/app/utils/avatar';
import { useIsMobile } from '@/app/utils/device';

import { Collaborator } from '@/app/types/projectInnerSettings';

import { ChatWithId } from '../../core/contexts/ChatContext';
import { Slot } from '../../core/slots';
import { ChatbotLabModal } from '../ChatbotLabModal';

interface SectionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

interface Section {
  id: string;
  label: string;
  icon?: React.ReactNode;
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
 * LeftPanel
 *
 * Navigation panel displayed to the left of the chat list.
 * Contains organized sections for inbox, chats, team, and teammates.
 */
const LeftPanelComponent: React.FC<LeftPanelProps> = ({
  activeFilter,
  onFilterChange,
  onCollapseChange,
  // collaborators = [],
  // profilePictures = new Map(),
  orderedChats = [],
  currentUserEmail = null,
}) => {
  const t = useTranslations('messages');
  const isMobile = useIsMobile();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['chats', 'team', 'teammates'])
  );
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isLabModalOpen, setIsLabModalOpen] = useState<boolean>(false);

  // Notify parent of collapse state changes
  useEffect(() => {
    onCollapseChange?.(isCollapsed);
  }, [isCollapsed, onCollapseChange]);

  // Calculate badges for each filter (must be before early return)
  const badges = useMemo(() => {
    const getLatestAssignee = (chat: ChatWithId): string | null => {
      if (!chat.assignees) return null;
      const assigneeEntries = Object.values(chat.assignees);
      if (assigneeEntries.length === 0) return null;
      const latest = assigneeEntries.reduce((prev, curr) =>
        curr.timestamp > prev.timestamp ? curr : prev
      );
      return latest.assignee;
    };

    const getChatStatus = (chat: ChatWithId): string => chat.status || 'open';

    const calculateBadgeCount = (filterFn: (chat: ChatWithId) => boolean): number =>
      orderedChats
        .filter(filterFn)
        .filter((chat) => !chat.enabled)
        .filter((chat) => chat.message?.role === 'user').length;

    return {
      inbox: calculateBadgeCount((chat) => getLatestAssignee(chat) === currentUserEmail),
      withBot: calculateBadgeCount((chat) => chat.enabled === true),
      unassigned: calculateBadgeCount((chat) => {
        const lastAssignee = getLatestAssignee(chat);
        const isUnassigned = !lastAssignee || lastAssignee === 'unassigned' || lastAssignee === 'none';
        return isUnassigned && chat.enabled === false;
      }),
      open: calculateBadgeCount((chat) => {
        const status = getChatStatus(chat);
        return status === 'open' || status === 'verify-payment';
      }),
      blocked: calculateBadgeCount((chat) => getChatStatus(chat) === 'blocked'),
      closed: calculateBadgeCount((chat) => getChatStatus(chat) === 'closed'),
      all: calculateBadgeCount(() => true),
    };
  }, [orderedChats, currentUserEmail]);

  // Hide panel on mobile devices
  if (isMobile) {
    return null;
  }

  // const bigIconSize = 20;
  const iconSize = 16;
  // const smallIconSize = 14;

  // Generate teammates items from collaborators
  /*
  const teammatesItems: SectionItem[] = collaborators.map((collaborator) => {
    const pictureUrl = profilePictures.get(collaborator.email);
    // Team members don't have gender in this context, so use default
    const avatarConfig = generateAvatarConfig(collaborator.email);

    return {
      id: collaborator.email,
      label: collaborator.name,
      icon: pictureUrl ? (
        <img
          src={pictureUrl}
          alt={collaborator.name}
          style={{ width: `${bigIconSize}px`, height: `${bigIconSize}px`, minWidth: `${bigIconSize}px` }}
          className="rounded-full object-cover"
        />
      ) : (
        <Avatar
          {...avatarConfig}
          style={{ width: `${bigIconSize}px`, height: `${bigIconSize}px`, minWidth: `${bigIconSize}px` }}
          className="rounded-full"
        />
      ),
    };
  });
  */

  const inboxBadge = badges.inbox;

  const sections: Section[] = [
    {
      id: 'chats',
      label: t('Chats'),
      items: [
        {
          id: 'with-bot',
          label: t('With bot'),
          icon: <WandSparkles size={iconSize} />,
          badge: badges.withBot,
        },
        {
          id: 'unassigned',
          label: t('Unassigned'),
          icon: <UserRoundX size={iconSize} />,
          badge: badges.unassigned,
        },
        { id: 'open', label: t('Opened'), icon: <CircleEllipsis size={iconSize} />, badge: badges.open },
        { id: 'blocked', label: t('Blocked'), icon: <Construction size={iconSize} />, badge: badges.blocked },
        { id: 'closed', label: t('Closed'), icon: <CircleCheck size={iconSize} />, badge: badges.closed },
        { id: 'all', label: t('All'), icon: <MessagesSquare size={iconSize} />, badge: badges.all },
      ],
    },
    /*
    {
      id: 'team',
      label: t('Teams'),
      items: [{ id: 'general', label: t('General'), icon: <Hash size={smallIconSize} />, badge: 0 }],
    },
    {
      id: 'teammates',
      label: t('Teammates'),
      items: teammatesItems,
    },
    */
  ];

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  return (
    <div className="relative flex flex-col h-full w-full bg-white border-r border-gray-200 overflow-y-auto">
      {/* Slot: Top of left panel - for logo, branding */}
      <Slot name="left-panel-top" />

      <div
        className={`flex w-full items-center py-2 pt-1 ${
          isCollapsed ? 'justify-center px-2' : 'justify-between pl-4 pr-1.5'
        }`}
      >
        {!isCollapsed && <div className="cursor-default text-sm font-semibold">{t('Inbox')}</div>}
        <Button variant="ghost" className="cursor-pointer" onClick={() => setIsCollapsed(!isCollapsed)}>
          {isCollapsed ? <PanelRight size={iconSize} /> : <PanelLeft size={iconSize} />}
        </Button>
      </div>

      {/* Navigation sections */}
      <div className="flex flex-col py-0 gap-3">
        {/* Inbox header */}

        <div className={`w-full ${isCollapsed ? 'px-2' : 'px-3'}`}>
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  key={'inbox'}
                  variant="ghost"
                  onClick={() => onFilterChange('inbox')}
                  className={`cursor-pointer relative ${
                    activeFilter === 'inbox' ? 'bg-gray-100 text-black' : 'text-gray-600'
                  }`}
                >
                  <Inbox size={iconSize} />
                  {inboxBadge > 0 && (
                    <Badge className="absolute top-1 right-1 h-4 w-4 rounded-full px-1 font-mono font-medium tabular-nums text-[10px] bg-red-500 flex items-center justify-center">
                      {inboxBadge}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('Your inbox')}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              key={'inbox'}
              onClick={() => onFilterChange('inbox')}
              className={`cursor-pointer rounded-md w-full flex items-center justify-between gap-3 pl-4 pr-2 py-1 text-sm transition-colors ${
                activeFilter === 'inbox'
                  ? 'bg-gray-100 text-black'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <Inbox size={iconSize} />
                {t('Your inbox')}
              </div>
              {inboxBadge > 0 && (
                <span className="flex items-center justify-end w-[20px] h-[20px] text-gray-700 text-[10px] font-medium rounded-full text-center">
                  {inboxBadge}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Divider after inbox - only in collapsed view */}
        {isCollapsed && <div className="w-auto h-px mx-4 bg-gray-200 my-2" />}

        {sections.map((section, sectionIndex) => (
          <React.Fragment key={section.id}>
            <div className={`mb-1 ${isCollapsed ? 'px-2' : 'px-3'}`}>
              {/* Section header - only show when not collapsed */}
              {!isCollapsed && (
                <button
                  className={`w-full flex items-center gap-1 py-2 text-sm font-medium text-gray-500 ${
                    section.items ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => section.items && toggleSection(section.id)}
                >
                  {/* Chevron for accordion sections, icon for non-accordion */}
                  {section.items ? (
                    <div className="text-gray-400">
                      {expandedSections.has(section.id) ? (
                        <ChevronDown size={iconSize} />
                      ) : (
                        <ChevronRight size={iconSize} />
                      )}
                    </div>
                  ) : (
                    section.icon
                  )}
                  <span className="text-xs font-semibold">{section.label}</span>
                </button>
              )}

              {/* Section items */}
              {section.items && (isCollapsed || expandedSections.has(section.id)) && (
                <div className="flex flex-col">
                  {section.items.map((item) =>
                    isCollapsed ? (
                      <Tooltip key={item.id}>
                        <TooltipTrigger>
                          <Button
                            variant="ghost"
                            onClick={() => onFilterChange(item.id)}
                            className={`cursor-pointer relative ${
                              activeFilter === item.id ? 'bg-gray-100 text-black' : 'text-gray-600'
                            }`}
                          >
                            {item.icon}
                            {item.badge !== undefined && item.badge > 0 && (
                              <Badge className="absolute top-1 right-1 h-4 w-4 rounded-full px-1 font-mono font-medium tabular-nums text-[10px] bg-red-500 flex items-center justify-center">
                                {item.badge}
                              </Badge>
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{item.label}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <button
                        key={item.id}
                        onClick={() => onFilterChange(item.id)}
                        className={`cursor-pointer rounded-md w-full flex items-center justify-between gap-3 pl-4 pr-2 py-1 text-sm transition-colors ${
                          activeFilter === item.id
                            ? 'bg-gray-100 text-black'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <div className="w-full flex items-center gap-3">
                          {item.icon}
                          <span className="flex-1 min-w-0 truncate flex justify-start">
                            <div className="w-full inline-block truncate text-align-left text-left">
                              {item.label}
                            </div>
                          </span>
                        </div>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="flex items-center justify-end w-[20px] h-[20px] text-gray-700 text-[10px] font-medium rounded-full text-center">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Divider between sections - only in collapsed view */}
            {isCollapsed && sectionIndex < sections.length - 1 && (
              <div className="w-auto h-px mx-4 bg-gray-200 my-2" />
            )}
          </React.Fragment>
        ))}

        {/* Test your chatbot button */}
        <div className={`${isCollapsed ? 'px-2' : 'px-3'}`}>
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  onClick={() => setIsLabModalOpen(true)}
                  className="cursor-pointer w-full"
                >
                  <FlaskConical size={iconSize} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('Test your bot')}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={() => setIsLabModalOpen(true)}
              className="cursor-pointer rounded-md w-full flex items-center gap-3 pl-4 pr-2 py-1 text-sm text-gray-600 transition-colors hover:bg-gray-100"
            >
              <FlaskConical size={iconSize} />
              {t('Test your bot')}
            </button>
          )}
        </div>
      </div>

      {/* Spacer to push bottom content */}
      <div className="flex-grow"></div>

      <ChatbotLabModal open={isLabModalOpen} onOpenChange={setIsLabModalOpen} />

      {/* Slot: Bottom of left panel - for additional actions */}
      <Slot name="left-panel-bottom" />
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const LeftPanel = memo(LeftPanelComponent);

LeftPanel.displayName = 'LeftPanel';
