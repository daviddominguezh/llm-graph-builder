import { ChannelBadge } from '@/app/components/messages/shared/icons';
import { TEST_PHONE } from '@/app/constants/messages';
import { LastMessage } from '@/app/types/chat';
import { Collaborator } from '@/app/types/projectInnerSettings';
import { generateAvatarConfig } from '@/app/utils/avatar';
import { getMessageText } from '@/app/utils/message';
import { formatTimestamp, parseChatId } from '@/app/utils/strs';
import { Badge } from '@/components/ui/badge';
import { Check, CheckCheck, CircleAlert, FlaskConical, Loader, User, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import React, { useMemo } from 'react';
import Avatar from 'react-nice-avatar';

const HOT_THRESHOLD = 70;
const WARM_THRESHOLD = 40;

function getLeadScoreBadge(
  metadata: Record<string, unknown> | null | undefined
): { score: number; color: string } | null {
  if (metadata === null || metadata === undefined) return null;
  const score = metadata['lead_score'];
  if (typeof score !== 'number') return null;
  if (score >= HOT_THRESHOLD) return { score, color: 'bg-green-500' };
  if (score >= WARM_THRESHOLD) return { score, color: 'bg-yellow-500' };
  return { score, color: 'bg-gray-400' };
}

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
  const t = useTranslations('messages');

  const isTest = phone === TEST_PHONE;
  const userChannelId = lastMessage?.userChannelId ?? phone;

  // Parse userChannelId to get source and display name
  const parsedChat = useMemo(() => {
    return parseChatId(userChannelId);
  }, [userChannelId]);

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

  const leadScoreBadge = useMemo(
    () => getLeadScoreBadge(lastMessage?.metadata),
    [lastMessage?.metadata]
  );

  const toFirstUppercase = (name: string) => {
    if (name === undefined || name === null) return '';
    if (name.length < 2) return name.toUpperCase();
    return name.substring(0, 1).toUpperCase() + name.substring(1);
  };

  // Determine if there are unanswered messages
  // If the last message is from the user (not us), it's unanswered
  const hasUnansweredMessages = lastMessage?.message?.role === 'user';

  return (
    <button
      className={`shrink-0 relative mx-1.5 w-[calc(100%-var(--spacing)*3)] overflow-hidden cursor-pointer group py-1.5 rounded-md ${selected ? 'bg-primary/8' : 'hover:bg-primary/8'} ${isHighlightedImportant ? 'border-red-500 border-1 bg-red-50' : ''}`}
      onClick={() => onClickMsg(phone)}
    >
      <div
        className={`flex w-full items-center overflow-hidden rounded-none py-1 pl-1.5 pr-3 ${selected ? 'border-l-2 border-transparent' : 'border-l-2 border-transparent group-hover:border-transparent'}`}
      >
        <div
          className="relative"
          style={{
            width: 'fit-content',
            height: 'fit-content',
            borderRadius: '100px',
          }}
        >
          <Avatar className="w-7.5 h-7.5" {...avatarConfig} />
          {isTest && (
            <div className="absolute bottom-[-2px] right-[-2px] bg-[#3b82f6] text-white rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
              <FlaskConical size={9} />
            </div>
          )}
          {!isTest && (
            <div className="absolute bottom-[-8px] right-[-8px]">
              <ChannelBadge channel={lastMessage?.channel ?? parsedChat.source} size={22} />
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
                  <span className={`text-xs text-foreground font-semibold text-start whitespace-nowrap`}>
                    {toFirstUppercase(name)}
                  </span>
                  {!isTest && parsedChat.source !== 'instagram' && (
                    <span
                      className="text-xs font-medium text-muted-foreground truncate"
                      style={{ marginTop: '0px', marginRight: '6px' }}
                    >
                      {toFirstUppercase(formattedPhone)}
                    </span>
                  )}
                </>
              ) : (
                <span className={`text-xs text-foreground font-semibold text-start whitespace-nowrap`}>
                  {toFirstUppercase(formattedPhone)}
                </span>
              )}
            </div>
            <div
              style={{ marginTop: '0px' }}
              className={`text-[10px] text-gray-500 ${isHighlightedImportant ? 'text-red-500' : ''}`}
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
                className={`text-xs ${isHighlightedImportant ? 'text-foreground font-medium' : 'text-gray-500'}`}
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
                  <Zap className="rounded-full w-[16px] h-[16px] text-accent" />
                </div>
              ) : assigneeDisplay ? (
                <div className="shrink-0">
                  {assigneeDisplay.pictureUrl ? (
                    <Image
                      src={assigneeDisplay.pictureUrl}
                      alt={assigneeDisplay.name}
                      width={18}
                      height={18}
                      className="rounded-full object-cover"
                      unoptimized
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
                {currentStatus === 'blocked' ? (
                  <CircleAlert className="rounded-full w-[16px] h-[16px] text-red-500" />
                ) : currentStatus === 'closed' ? (
                  <Check className="rounded-full w-[16px] h-[16px] text-[#22c55e] pt-[2px]" />
                ) : (
                  <Loader strokeWidth={2.5} className="rounded-full w-[16px] h-[16px] text-[#6b7280]" />
                )}
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
              {/* Lead score badge */}
              {leadScoreBadge !== null && (
                <Badge
                  className={`h-4 min-w-4 rounded-full px-1 font-mono font-medium tabular-nums text-[10px] ${leadScoreBadge.color}`}
                  title={`${t('Lead score')}: ${String(leadScoreBadge.score)}`}
                >
                  {leadScoreBadge.score}
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

    </button>
  );
};

export default MessagePreview;
