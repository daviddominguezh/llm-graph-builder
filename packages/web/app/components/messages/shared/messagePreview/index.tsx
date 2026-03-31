import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from 'react-nice-avatar';

import {
  CheckCheck,
  CircleCheck,
  CircleEllipsis,
  Construction,
  FlaskConical,
  Instagram,
  User,
} from 'lucide-react';

import { TAG_COLORS } from '@features/chatSettings/tagsUtils';
import { useChat } from '@features/messagesDashboard/core/contexts';

import { WhatsAppIcon } from '@components/icons';
import { Badge } from '@components/ui/badge';

import { generateAvatarConfig } from '@globalUtils/avatar';
import { getMessageText } from '@globalUtils/message';
import { formatTimestamp, parseChatId } from '@globalUtils/strs';

import { TEST_PHONE } from '@constants/messages';

import { LastMessage } from '@globalTypes/chat';
import { Collaborator } from '@globalTypes/projectInnerSettings';

import styles from './index.module.css';

import LogoImg from '@assets/logoRounded.png';

interface MessagePreviewProps {
  lastMessage?: LastMessage;
  phone: string;
  profilePic?: string;
  onClickMsg: (id: string) => void;
  selected: boolean;
  collaborators?: Collaborator[];
  profilePictures?: Map<string, string>;
}
const MessagePreview: React.FC<MessagePreviewProps> = ({
  lastMessage,
  phone,
  onClickMsg,
  selected,
  collaborators = [],
  profilePictures = new Map(),
}: MessagePreviewProps) => {
  const { t } = useTranslation();
  const { availableTags } = useChat();

  const isTest = phone === TEST_PHONE;

  // Parse chat ID to get source and display name
  const parsedChat = useMemo(() => {
    return parseChatId(phone);
  }, [phone]);

  const formattedPhone = parsedChat.displayName;

  // Get name if available, otherwise null (phone number will be shown instead)
  const name = (() => {
    if (isTest) return 'Closer';
    if (!lastMessage?.name) return null; // No name, will show phone number only
    const baseName = lastMessage.name
      .split(' ')
      .map((partName) => partName.substring(0, 1).toLocaleUpperCase() + partName.substring(1))
      .join(' ');
    // For Instagram, prepend @ to the name
    return parsedChat.source === 'instagram' ? `@${baseName.toLowerCase()}` : baseName;
  })();

  // Generate avatar config using phone number to ensure consistency
  const avatarConfig = useMemo(() => {
    // Use the full phone with 'whatsapp:' prefix for consistency with ChatHeader
    return phone ? generateAvatarConfig(phone) : generateAvatarConfig('');
  }, [phone]);

  const isHighlightedImportant = lastMessage && lastMessage.status === 'boss';

  // Format badge label: first letter uppercase, except "vip" which is all uppercase
  const formatBadgeLabel = (label: string): string => {
    if (label.toLowerCase() === 'vip') return 'VIP';
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  // Get tag information
  const chatTags = useMemo(() => {
    if (!lastMessage?.tags || lastMessage.tags.length === 0) return [];

    const tags = lastMessage.tags
      .map((tagId) => {
        const tag = availableTags.find((t) => t.tagID === tagId);
        if (!tag) return null;

        const isPredefined = TAG_COLORS[tagId];
        const color = isPredefined ? TAG_COLORS[tagId] : '#6b7280';
        const rawLabel = isPredefined ? t(`tag-${tagId}`) : tag.tag;
        const label = formatBadgeLabel(rawLabel);

        return { tagId, label, color };
      })
      .filter((tag): tag is { tagId: string; label: string; color: string } => tag !== null);

    return tags;
  }, [lastMessage?.tags, availableTags, t]);

  // Get current assignee (the one with highest timestamp)
  const currentAssignee = useMemo(() => {
    if (!lastMessage?.assignees) return null;

    const assigneeEntries = Object.values(lastMessage.assignees);
    if (assigneeEntries.length === 0) return null;

    // Find assignee with highest timestamp
    const latestAssignee = assigneeEntries.reduce((latest, current) => {
      return current.timestamp > latest.timestamp ? current : latest;
    });

    // Don't show if assignee is "none" or "unassigned"
    if (latestAssignee.assignee === 'none' || latestAssignee.assignee === 'unassigned') {
      return null;
    }

    return latestAssignee.assignee;
  }, [lastMessage?.assignees]);

  // Get assignee's profile picture or avatar
  const assigneeDisplay = useMemo(() => {
    if (!currentAssignee) return null;

    const assignedCollaborator = collaborators.find((c) => c.email === currentAssignee);
    if (!assignedCollaborator) return null;

    const pictureUrl = profilePictures.get(currentAssignee);
    const avatarConfig = generateAvatarConfig(currentAssignee);

    return {
      pictureUrl,
      avatarConfig,
      name: assignedCollaborator.name,
    };
  }, [currentAssignee, collaborators, profilePictures]);

  // Get current status (the one with highest timestamp, default to 'open')
  const currentStatus = useMemo(() => {
    if (!lastMessage?.statuses) return 'open';

    const statusEntries = Object.values(lastMessage.statuses);
    if (statusEntries.length === 0) return 'open';

    // Find status with highest timestamp
    const latestStatus = statusEntries.reduce((latest, current) => {
      return current.timestamp > latest.timestamp ? current : latest;
    });

    return latestStatus.status;
  }, [lastMessage?.statuses]);

  // Get status icon and color
  const statusDisplay = useMemo(() => {
    switch (currentStatus) {
      case 'blocked':
        return {
          icon: Construction,
          color: '#eab308', // yellow-500
        };
      case 'closed':
        return {
          icon: CircleCheck,
          color: '#22c55e', // green-500
        };
      case 'open':
      default:
        return {
          icon: CircleEllipsis,
          color: '#6b7280', // gray-500
        };
    }
  }, [currentStatus]);

  // Check if this is a verify-payment status (needs warning border)
  const isVerifyPayment = lastMessage?.status === 'verify-payment';

  // Determine if there are unanswered messages
  // If the last message is from the user (not us), it's unanswered
  const hasUnansweredMessages = lastMessage?.message?.role === 'user';

  return (
    <button
      className={`relative border-b-1 lg:border-b-0`}
      style={{ width: '100%', height: 'fit-content', overflowX: 'hidden', padding: '0px 6px' }}
    >
      <div
        onClick={() => onClickMsg(phone)}
        className={`${styles['bg']} ${selected ? styles['activeBG'] : ''} ${isHighlightedImportant ? 'border-red-500 border-1 bg-red-50' : ''} ${isVerifyPayment ? 'border-amber-500! border-1 bg-amber-50' : ''}`}
        style={{
          width: '100%',
          paddingTop: '12px',
          paddingBottom: '12px',
          paddingLeft: '6px',
          paddingRight: '12px',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          cursor: 'pointer',
          borderRadius: '8px',
          overflowX: 'hidden',
          ...(isVerifyPayment && {
            backgroundColor: '#fffbeb',
            borderWidth: '1px',
            borderColor: '#f59e0b',
            borderStyle: 'solid',
            marginBottom: '1px',
          }),
        }}
      >
        <div
          className="relative"
          style={{
            width: 'fit-content',
            height: 'fit-content',
            border: '2px solid white',
            borderRadius: '100px',
          }}
        >
          <Avatar className="w-8 h-8" {...avatarConfig} />
          {isTest && (
            <div className="absolute bottom-[-2px] right-[-2px] bg-[#3b82f6] text-white rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
              <FlaskConical size={9} />
            </div>
          )}
          {!isTest && parsedChat.source === 'whatsapp' && (
            <div className="absolute bottom-[-2px] right-[-2px] bg-white rounded-full w-[18px] h-[18px] flex items-center justify-center border border-gray-200 shadow-sm">
              <WhatsAppIcon size={10} className="text-[#25D366]" />
            </div>
          )}
          {!isTest && parsedChat.source === 'instagram' && (
            <div className="absolute bottom-[-2px] right-[-2px] bg-white rounded-full w-[18px] h-[18px] flex items-center justify-center border border-gray-200 shadow-sm">
              <Instagram size={10} className="text-[#E4405F]" />
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            gap: '0px',
            flexDirection: 'column',
            marginLeft: '12px',
            justifyContent: 'flex-start',
            overflowX: 'hidden',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: '1 1 0', minWidth: 0 }}>
              {name ? (
                <>
                  <span
                    className={`text-[15px] text-black font-semibold text-start whitespace-nowrap`}
                  >
                    {name}
                  </span>
                  {!isTest && parsedChat.source !== 'instagram' && (
                    <span
                      className="text-xs font-medium text-gray-600 truncate"
                      style={{ marginTop: '0px', marginRight: '6px' }}
                    >
                      {formattedPhone}
                    </span>
                  )}
                </>
              ) : (
                <span
                  className={`text-[15px] text-black font-semibold text-start whitespace-nowrap`}
                >
                  {formattedPhone}
                </span>
              )}
            </div>
            <div
              style={{ marginTop: '0px' }}
              className={`text-xs text-gray-500 ${isHighlightedImportant ? 'text-red-500' : ''}`}
            >
              {formatTimestamp(lastMessage?.timestamp || Date.now())}
            </div>
          </div>
          {lastMessage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexGrow: '1' }}>
              {lastMessage.message?.role !== 'user' && getMessageText(lastMessage.message) && (
                <CheckCheck style={{ flexShrink: 0 }} size={14} />
              )}
              <span
                style={{
                  width: '100%',
                  textAlign: 'start',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
                className={`text-[13px] ${isHighlightedImportant ? 'text-black font-medium' : 'text-gray-500'}`}
              >
                {lastMessage.type === 'image' || lastMessage.type === 'video'
                  ? `📷 ${t('Image')}`
                  : lastMessage.type === 'pdf'
                    ? `📄 ${t('PDF')}`
                    : lastMessage.type === 'audio'
                      ? `🎤 ${t('Audio')}`
                      : getMessageText(lastMessage.message) || ''}
              </span>
              {/* Show logo if AI enabled, otherwise show assignee profile pic or user icon */}
              {lastMessage?.enabled ? (
                <div className="shrink-0">
                  <img src={LogoImg} alt="AI" className="w-4 h-4 rounded-full object-cover" />
                </div>
              ) : assigneeDisplay ? (
                <div className="shrink-0">
                  {assigneeDisplay.pictureUrl ? (
                    <img
                      src={assigneeDisplay.pictureUrl}
                      alt={assigneeDisplay.name}
                      className="w-4 h-4 rounded-full object-cover"
                    />
                  ) : (
                    <Avatar
                      {...assigneeDisplay.avatarConfig}
                      style={{ width: '16px', height: '16px', minWidth: '16px' }}
                      className="rounded-full"
                    />
                  )}
                </div>
              ) : (
                <div className="shrink-0">
                  <User size={16} color="#6b7280" strokeWidth={2} />
                </div>
              )}

              {/* Status icon */}
              <div className="shrink-0">
                {React.createElement(statusDisplay.icon, {
                  size: 16,
                  color: statusDisplay.color,
                  strokeWidth: 2,
                })}
              </div>

              {/* Show inquiry badge for important messages */}
              {isHighlightedImportant && (
                <Badge className="h-5 min-w-5 rounded-full px-1 font-mono tabular-nums text-xs bg-red-500">
                  !
                </Badge>
              )}

              {/* Show unread badge when AI is disabled and there are unanswered messages */}
              {!lastMessage?.enabled && hasUnansweredMessages && (
                <Badge className="h-4 min-w-4 rounded-full px-1 font-mono font-medium tabular-nums text-[10px] bg-red-500">
                  !
                </Badge>
              )}
            </div>
          )}
          {/* Tags display */}
          {chatTags.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '4px',
                flexWrap: 'wrap',
              }}
            >
              {chatTags.map((tag) => (
                <div
                  key={tag.tagId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 6px',
                    borderRadius: '200px',
                    backgroundColor: 'white',
                    border: `1px solid ${tag.color}`,
                  }}
                >
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: tag.color,
                    }}
                  />
                  <span className="font-semibold text-gray-500 text-[10px]">{tag.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="w-full px-4 absolute bottom-[0px] left-0">
        <div className="w-full border-b-0 lg:border-b-1 border-(--bg-color)"></div>
      </div>
    </button>
  );
};

export default MessagePreview;
