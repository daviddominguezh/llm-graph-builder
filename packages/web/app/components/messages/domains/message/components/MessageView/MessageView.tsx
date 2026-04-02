
import React, { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import NextImage from 'next/image';
import Avatar from 'react-nice-avatar';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

import { CheckCheck, ChevronDown, Loader2, MessageCircle, Sparkles } from 'lucide-react';

import type { Note } from '@/app/components/messages/services/api';
import { getUserPictureByEmailCached } from '@/app/components/messages/services/api';

import { MessageReplyPreview } from '@/app/components/messages/shared/messageReplyPreview';
import { Badge } from '@/components/ui/badge';

import { generateAvatarConfig } from '@/app/utils/avatar';
import { getMessageText } from '@/app/utils/message';
import { formatTimestamp, formatWhatsapp } from '@/app/utils/strs';

import { Conversation, INTENT, Message } from '@/app/types/chat';
import { Collaborator } from '@/app/types/projectInnerSettings';

import { Slot } from '../../../../core/slots';
import { AudioPlayer } from './AudioPlayer';

import PDFImg from '@/app/components/messages/shared/assets';

/**
 * Custom List component for Virtuoso with padding
 */
const VirtuosoList = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ style, children, ...props }, ref) => (
    <div ref={ref} style={style} className="p-4" {...props}>
      {children}
    </div>
  )
);
VirtuosoList.displayName = 'VirtuosoList';

/**
 * Item types for virtualized list (messages and date headers)
 */
interface DateHeaderItem {
  type: 'date-header';
  id: string;
  date: string;
}

interface MessageItem {
  type: 'message';
  id: string;
  message: Message;
  isNote: boolean;
  isAssigneeChange: boolean;
  isStatusChange: boolean;
}

type VirtualizedItem = DateHeaderItem | MessageItem;

/**
 * Context for sharing stable callbacks with memoized message items
 */
interface MessageContextValue {
  isTestChatActive: boolean;
  findRepliedMessage: (replyId: string) => Message | null;
  handleReplyClick: (messageId: string) => void;
  onAskAI?: (messageText: string) => void;
  getStatusDisplay: (statusValue: string) => {
    label: string;
    textColor: string;
    bgColor: string;
    borderColor: string;
  };
  t: (key: string) => string;
}

const MessageContext = React.createContext<MessageContextValue | null>(null);

/**
 * Memoized message item component to prevent re-renders during scroll
 */
interface MessageItemComponentProps {
  item: MessageItem;
  previousMessage: Message | null;
  imageOrientation: 'landscape' | 'portrait' | undefined;
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>, messageId: string) => void;
  onImageRef: (imgElement: HTMLImageElement | null, messageId: string) => void;
  isHighlighted: boolean;
  noteProfilePicUrl: string | null | undefined;
  assigneeProfilePicUrl: string | null | undefined;
  hasUserReplyAfter: boolean;
}

const MessageItemComponent = memo<MessageItemComponentProps>(
  ({
    item,
    previousMessage,
    imageOrientation,
    onImageLoad,
    onImageRef,
    isHighlighted,
    noteProfilePicUrl,
    assigneeProfilePicUrl,
    hasUserReplyAfter,
  }) => {
    const context = React.useContext(MessageContext);
    const [isHovered, setIsHovered] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [hoveredDropdownOption, setHoveredDropdownOption] = useState<string | null>(null);
    const [dropdownPosition, setDropdownPosition] = useState<'above' | 'below'>('above');
    const [dropdownHorizontalOffset, setDropdownHorizontalOffset] = useState<number>(0);
    const dropdownTriggerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [positionCalculated, setPositionCalculated] = useState(false);
    const highlightedMessageRef = useRef<HTMLDivElement>(null);

    // Handle click outside to close dropdown (must be before early return)
    useEffect(() => {
      if (!isDropdownOpen) return;

      const handleClickOutside = (event: MouseEvent) => {
        if (
          dropdownRef.current &&
          dropdownTriggerRef.current &&
          !dropdownRef.current.contains(event.target as Node) &&
          !dropdownTriggerRef.current.contains(event.target as Node)
        ) {
          setIsDropdownOpen(false);
          setPositionCalculated(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isDropdownOpen]);

    // Calculate dropdown position when dropdown opens (must be before early return)
    useEffect(() => {
      if (!isDropdownOpen || positionCalculated) {
        return;
      }

      requestAnimationFrame(() => {
        if (!dropdownTriggerRef.current) {
          setDropdownPosition('above');
          setDropdownHorizontalOffset(0);
          setPositionCalculated(true);
          return;
        }

        const triggerRect = dropdownTriggerRef.current.getBoundingClientRect();
        const dropdownHeight = 100;
        const dropdownWidth = 240;

        const container = dropdownTriggerRef.current.closest('[data-virtuoso-scroller]');
        const containerRect = container?.getBoundingClientRect() || document.body.getBoundingClientRect();

        const spaceAbove = triggerRect.top - containerRect.top;
        const spaceBelow = containerRect.bottom - triggerRect.bottom;

        let horizontalOffset = 0;
        const defaultLeftEdge = triggerRect.right - dropdownWidth;
        const defaultRightEdge = triggerRect.right;

        if (defaultRightEdge <= containerRect.right && defaultLeftEdge >= containerRect.left) {
          horizontalOffset = 0;
        } else if (defaultRightEdge > containerRect.right) {
          horizontalOffset = defaultRightEdge - containerRect.right;
        } else if (defaultLeftEdge < containerRect.left) {
          horizontalOffset = -(containerRect.left - defaultLeftEdge);
        }

        const decision = spaceAbove < dropdownHeight && spaceBelow >= dropdownHeight ? 'below' : 'above';

        setDropdownPosition(decision);
        setDropdownHorizontalOffset(horizontalOffset);
        setPositionCalculated(true);
      });
    }, [isDropdownOpen, positionCalculated]);

    if (!context) return null;

    const { isTestChatActive, findRepliedMessage, handleReplyClick, onAskAI, getStatusDisplay, t } = context;

    const { message, isNote, isAssigneeChange, isStatusChange } = item;

    const styleAsAssistant =
      isTestChatActive && message.message.role === 'assistant'
        ? true
        : isTestChatActive && message.message.role !== 'assistant'
          ? false
          : message.message.role === 'assistant'
            ? false
            : true;

    const hasImage = message.mediaUrl && (message.type || '').startsWith('image');

    // Check if role changed from previous message
    const roleChanged =
      previousMessage &&
      !isNote &&
      !isAssigneeChange &&
      !isStatusChange &&
      previousMessage.type !== 'note' &&
      previousMessage.type !== 'assignee-change' &&
      previousMessage.type !== 'status-change' &&
      message.message.role !== previousMessage.message.role;

    // Get note creator info
    const noteCreator = isNote ? message.key : null;
    const noteAvatarConfig = noteCreator ? generateAvatarConfig(noteCreator) : null;

    // Get assignee info
    const assigneeEmail = isAssigneeChange ? message.key : null;
    const isUnassigned = assigneeEmail === 'none';
    const assigneeAvatarConfig = assigneeEmail && !isUnassigned ? generateAvatarConfig(assigneeEmail) : null;

    // Get status display info
    const statusValue = isStatusChange ? message.key : null;
    const statusDisplay = statusValue ? getStatusDisplay(statusValue) : null;

    // Whether this is an assistant message (used for double-check icon display)
    const isAssistantMessage =
      message.message.role === 'assistant' && !isNote && !isAssigneeChange && !isStatusChange;

    return (
      <div
        ref={isHighlighted ? highlightedMessageRef : null}
        className={`flex w-full items-center ${
          isNote || isAssigneeChange || isStatusChange
            ? 'justify-end my-4'
            : styleAsAssistant
              ? 'justify-start'
              : 'justify-end'
        } ${isNote || isAssigneeChange || isStatusChange ? '' : 'mb-[2px]'} ${
          isHighlighted ? 'animate-pulse relative' : ''
        } ${roleChanged ? 'mt-3' : ''}`}
      >
        {/* Dashed line for notes, assignee changes, and status changes */}
        {(isNote || isAssigneeChange || isStatusChange) && (
          <div className="flex-1 border-b border-dashed border-input mr-2" />
        )}

        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`${hasImage && imageOrientation ? 'px-0 pt-0 pb-[2px]' : 'p-1 pt-1 pb-[2px]'} rounded-lg relative flex flex-col ${
            isNote || isAssigneeChange || isStatusChange ? 'w-[255px]' : 'max-w-[70%]'
          } ${
            isNote
              ? 'bg-yellow-50 dark:bg-background border border-yellow-300 dark:border-yellow-400 text-foreground'
              : isAssigneeChange
                ? 'bg-background border border-input border-dashed text-foreground'
                : isStatusChange && statusDisplay
                  ? `${statusDisplay.bgColor} border ${statusDisplay.borderColor} text-foreground`
                  : styleAsAssistant
                    ? 'bg-accent/10 dark:bg-accent/30 text-foreground'
                    : 'bg-card border-[#c4dbf0]'
          } ${
            isHighlighted
              ? 'bg-[#fff3cd] border-[#ffc107] shadow-[0_0_12px_rgba(255,193,7,0.3)]'
              : ''
          }`}
          style={{
            ...(hasImage && imageOrientation
              ? {
                  width: imageOrientation === 'landscape' ? '330px' : '240px',
                }
              : {}),
          }}
        >
          {/* Chevron dropdown button - appears on hover */}
          {(isHovered || isDropdownOpen) && !isNote && !isAssigneeChange && !isStatusChange && (
            <div
              ref={isDropdownOpen ? dropdownTriggerRef : null}
              className={`absolute top-2 right-2 z-20 rounded hover:bg-border ${
                isHighlighted ? 'bg-card' : 'bg-card'
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDropdownOpen(!isDropdownOpen);
                }}
                className="w-6 h-6 flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronDown size={16} className="text-muted-foreground" />
              </button>

              {/* Dropdown menu */}
              {isDropdownOpen && (
                <div
                  ref={dropdownRef}
                  className={`absolute bg-white border border-gray-200 rounded-md shadow-lg min-w-[240px] py-1 z-30 ${
                    dropdownPosition === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
                  }`}
                  style={{
                    right: `${dropdownHorizontalOffset}px`,
                    visibility: positionCalculated ? 'visible' : 'hidden',
                  }}
                >
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      const messageText = getMessageText(message.message) || '';
                      if (onAskAI && messageText) {
                        onAskAI(messageText);
                      }
                      setIsDropdownOpen(false);
                    }}
                    onMouseEnter={() => setHoveredDropdownOption('ask-ai')}
                    onMouseLeave={() => setHoveredDropdownOption(null)}
                    className={`w-full px-3 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer ${
                      hoveredDropdownOption === 'ask-ai'
                        ? 'bg-gray-100 text-gray-900'
                        : 'bg-transparent text-gray-700'
                    }`}
                  >
                    <Sparkles size={16} />
                    <span>{t('Ask AI')}</span>
                  </div>
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDropdownOpen(false);
                    }}
                    onMouseEnter={() => setHoveredDropdownOption('reply-internally')}
                    onMouseLeave={() => setHoveredDropdownOption(null)}
                    className={`w-full px-3 py-2 text-sm flex items-center gap-2 transition-colors cursor-pointer ${
                      hoveredDropdownOption === 'reply-internally'
                        ? 'bg-gray-100 text-gray-900'
                        : 'bg-transparent text-gray-700'
                    }`}
                  >
                    <MessageCircle size={16} />
                    <span>{t('Reply Internally')}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Reply preview */}
          {message.replyId && (
            <MessageReplyPreview
              repliedMessage={findRepliedMessage(message.replyId)}
              onClick={handleReplyClick}
              isUserMessage={styleAsAssistant}
            />
          )}

          {/* Image media */}
          {message.mediaUrl &&
            (message.type || '').startsWith('image') &&
            (() => {
              // While loading: show small placeholder + hidden image to detect orientation
              if (!imageOrientation) {
                return (
                  <div className="relative">
                    {/* Hidden image to detect orientation */}
                    <NextImage
                      ref={(el) => onImageRef(el, message.id)}
                      onLoad={(e) => onImageLoad(e, message.id)}
                      src={message.mediaUrl}
                      alt=""
                      width={1}
                      height={1}
                      className="absolute opacity-0 pointer-events-none"
                      unoptimized
                    />
                    {/* Loading placeholder */}
                    <div className="w-[120px] h-[90px] bg-gray-100 rounded-[5px] flex items-center justify-center">
                      <Loader2 className="animate-spin text-gray-400" size={20} />
                    </div>
                  </div>
                );
              }

              // Once orientation is known: render actual image at correct size
              const width = imageOrientation === 'landscape' ? '330px' : '240px';
              return (
                <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="p-0.5">
                  <NextImage
                    className="h-auto block rounded-[5px] cursor-pointer"
                    style={{ width }}
                    src={message.mediaUrl}
                    alt={t('Message attachment')}
                    width={0}
                    height={0}
                    sizes="100vw"
                    unoptimized
                  />
                </a>
              );
            })()}

          {/* PDF/Document media */}
          {message.mediaUrl && (message.type === 'pdf' || message.type === 'document') && (
            <a href={message.mediaUrl} target="_blank" rel="noreferrer">
              <div className="cursor-pointer border border-[#e4e4e7] p-4 overflow-hidden flex justify-center items-center w-full h-[100px]">
                <NextImage
                  src={PDFImg}
                  alt="PDF"
                  width={0}
                  height={0}
                  sizes="100vw"
                  className="h-full w-auto object-contain object-center"
                  unoptimized
                />
              </div>
            </a>
          )}

          {/* Audio media */}
          {message.mediaUrl && message.type === 'audio' && <AudioPlayer src={message.mediaUrl} />}

          {/* Note label with creator */}
          {isNote && (
            <div className="px-2 pt-2 pb-1 flex items-center justify-end gap-2">
              <span className="text-xs text-gray-500 font-semibold">{t('Note')}</span>
              <div className="shrink-0">
                {noteProfilePicUrl ? (
                  <NextImage
                    src={noteProfilePicUrl}
                    alt={noteCreator || 'Creator'}
                    width={20}
                    height={20}
                    className="rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  noteAvatarConfig && <Avatar {...noteAvatarConfig} className="w-5 h-5" />
                )}
              </div>
            </div>
          )}

          {/* Status change content */}
          {isStatusChange && statusDisplay ? (
            <div className="px-2 pt-2 pb-1 flex items-center justify-end gap-1">
              <span className={`text-xs font-semibold ${statusDisplay.textColor}`}>
                {t('Status changed to')} {statusDisplay.label}
              </span>
            </div>
          ) : isAssigneeChange ? (
            isUnassigned ? (
              <div className="px-2 pt-2 pb-1 text-xs text-gray-500 font-semibold text-right">
                {getMessageText(message.message)}
              </div>
            ) : (
              <div className="px-2 pt-2 pb-1 flex items-center justify-end gap-2">
                <span className="text-xs text-gray-500 font-semibold">
                  {t('Assigned to')} {getMessageText(message.message)}
                </span>
                <div className="shrink-0">
                  {assigneeProfilePicUrl ? (
                    <NextImage
                      src={assigneeProfilePicUrl}
                      alt={assigneeEmail || 'Assignee'}
                      width={20}
                      height={20}
                      className="rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    assigneeAvatarConfig && (
                      <Avatar {...assigneeAvatarConfig} style={{ width: '20px', height: '20px' }} />
                    )
                  )}
                </div>
              </div>
            )
          ) : (
            // Don't show text content if it's an image message with '[image]' placeholder
            !(hasImage && getMessageText(message.message) === '[image]') && (
              <div
                className={`px-2 py-1 break-words whitespace-pre-wrap text-[14px] leading-[1.5] ${
                  isNote ? 'text-gray-600 text-right text-xs!' : 'text-foreground'
                }`}
                dangerouslySetInnerHTML={{
                  __html: formatWhatsapp(getMessageText(message.message) || ''),
                }}
              />
            )
          )}

          {/* Timestamp with double check for assistant messages */}
          <div className="text-[11px] text-[#71717a] text-right px-2 pb-[2px] mt-[2px] opacity-80 flex items-center justify-end gap-1">
            <span>{formatTimestamp(message.timestamp, true)}</span>
            {isAssistantMessage && (
              <CheckCheck size={14} className={hasUserReplyAfter ? 'text-blue-500' : 'text-gray-400'} />
            )}
          </div>

          {/* Slot: Message item actions */}
          <Slot name="message-item-actions" />
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if these specific props change
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.imageOrientation === nextProps.imageOrientation &&
      prevProps.previousMessage?.id === nextProps.previousMessage?.id &&
      prevProps.isHighlighted === nextProps.isHighlighted &&
      prevProps.noteProfilePicUrl === nextProps.noteProfilePicUrl &&
      prevProps.assigneeProfilePicUrl === nextProps.assigneeProfilePicUrl &&
      prevProps.hasUserReplyAfter === nextProps.hasUserReplyAfter
    );
  }
);

MessageItemComponent.displayName = 'MessageItemComponent';

/**
 * Reducer for tracking firstItemIndex for Virtuoso prepend support
 */
const INITIAL_ITEM_INDEX = 100000;

interface PrependState {
  firstItemIndex: number;
  previousItemCount: number;
  previousChatId: string | null;
}

interface PrependAction {
  currentCount: number;
  chatId: string | null;
}

function prependReducer(state: PrependState, action: PrependAction): PrependState {
  const { currentCount, chatId } = action;

  if (state.previousChatId !== chatId) {
    return {
      firstItemIndex: INITIAL_ITEM_INDEX,
      previousItemCount: currentCount,
      previousChatId: chatId,
    };
  }
  if (state.previousItemCount > 0 && currentCount > state.previousItemCount) {
    const itemsAdded = currentCount - state.previousItemCount;
    return {
      ...state,
      firstItemIndex: state.firstItemIndex - itemsAdded,
      previousItemCount: currentCount,
    };
  }
  if (currentCount !== state.previousItemCount) {
    return { ...state, previousItemCount: currentCount };
  }
  return state;
}

/**
 * MessageView component displays conversation messages
 * Handles message grouping by date, media rendering, virtualization, and scroll management
 */
interface MessageViewProps {
  messages: Conversation;
  notes?: Record<string, Note>;
  assignees?: Record<
    string,
    {
      assignee: string;
      timestamp: number;
    }
  >;
  statuses?: Record<
    string,
    {
      status: string;
      timestamp: number;
    }
  >;
  collaborators?: Collaborator[];
  isTestChatActive: boolean;
  highlightedMessageId: string | null;
  onReplyClick?: (messageId: string) => void;
  onAskAI?: (messageText: string) => void;
  chatId?: string | null;
  className?: string;
  // Pagination props
  loadOlderMessages?: () => Promise<void>;
  hasMoreOlderMessages?: boolean;
  isLoadingMessages?: boolean;
  isLoadingOlderMessages?: boolean;
}

const MessageViewComponent: React.FC<MessageViewProps> = ({
  messages,
  notes = {},
  assignees = {},
  statuses = {},
  collaborators = [],
  isTestChatActive,
  highlightedMessageId,
  onReplyClick,
  onAskAI,
  chatId,
  className = '',
  loadOlderMessages,
  hasMoreOlderMessages = true,
  isLoadingMessages = false,
  isLoadingOlderMessages = false,
}) => {
  const t = useTranslations('messages');
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const previousChatIdRef = useRef<string | null>(null);
  const [, setImageOrientations] = useState<Record<string, 'landscape' | 'portrait'>>({});
  // Ref mirror of imageOrientations to avoid callback recreation
  const imageOrientationsRef = useRef<Record<string, 'landscape' | 'portrait'>>({});
  const [noteProfilePictures, setNoteProfilePictures] = useState<Map<string, string>>(new Map());
  const [assigneeProfilePictures, setAssigneeProfilePictures] = useState<Map<string, string>>(new Map());

  // Track if loading older messages
  const isLoadingOlderRef = useRef(false);




  // For prepending older messages - track firstItemIndex
  // We use a high starting index so we have room to prepend items
  const [prependState, dispatchPrepend] = useReducer(prependReducer, {
    firstItemIndex: INITIAL_ITEM_INDEX,
    previousItemCount: 0,
    previousChatId: null,
  });

  // Clear image orientations when chat changes
  useEffect(() => {
    if (previousChatIdRef.current !== chatId) {
      previousChatIdRef.current = chatId || null;
      imageOrientationsRef.current = {};
    }
  }, [chatId]);

  // Handle reply click
  const handleReplyClick = useCallback(
    (messageId: string) => {
      onReplyClick?.(messageId);
    },
    [onReplyClick]
  );

  // Handle image load and determine orientation
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>, messageId: string) => {
    const img = e.currentTarget;
    // Use ref to check orientation to avoid callback recreation
    if (!imageOrientationsRef.current[messageId]) {
      const isLandscape = img.naturalWidth >= img.naturalHeight;
      const orientation = isLandscape ? 'landscape' : 'portrait';
      // Update ref immediately to prevent duplicate processing
      imageOrientationsRef.current[messageId] = orientation;
      setImageOrientations((prev) => ({
        ...prev,
        [messageId]: orientation,
      }));
    }
  }, []);

  // Handle image ref for cached images
  const handleImageRef = useCallback((imgElement: HTMLImageElement | null, messageId: string) => {
    // Only process complete cached images that don't have orientation set yet
    if (
      imgElement &&
      imgElement.complete &&
      imgElement.naturalWidth > 0 &&
      !imageOrientationsRef.current[messageId]
    ) {
      const isLandscape = imgElement.naturalWidth >= imgElement.naturalHeight;
      const orientation = isLandscape ? 'landscape' : 'portrait';
      // Update ref immediately to prevent duplicate processing
      imageOrientationsRef.current[messageId] = orientation;
      setImageOrientations((prev) => ({
        ...prev,
        [messageId]: orientation,
      }));
    }
  }, []);

  // Fetch profile pictures for note creators
  useEffect(() => {
    const fetchNoteProfilePictures = async () => {
      const notesArray = Object.values(notes);
      if (notesArray.length === 0) return;

      const picturePromises = notesArray.map(async (note) => {
        const pictureUrl = await getUserPictureByEmailCached(note.creator, true);
        return { email: note.creator, pictureUrl };
      });

      const pictures = await Promise.all(picturePromises);
      const pictureMap = new Map<string, string>();
      pictures.forEach(({ email, pictureUrl }) => {
        if (pictureUrl) {
          pictureMap.set(email, pictureUrl);
        }
      });
      setNoteProfilePictures(pictureMap);
    };

    fetchNoteProfilePictures();
  }, [notes]);

  // Fetch profile pictures for assignees
  useEffect(() => {
    const fetchAssigneeProfilePictures = async () => {
      const assigneesArray = Object.values(assignees).filter((a) => a.assignee !== 'none');
      if (assigneesArray.length === 0) return;

      const picturePromises = assigneesArray.map(async (assigneeData) => {
        const pictureUrl = await getUserPictureByEmailCached(assigneeData.assignee, true);
        return { email: assigneeData.assignee, pictureUrl };
      });

      const pictures = await Promise.all(picturePromises);
      const pictureMap = new Map<string, string>();
      pictures.forEach(({ email, pictureUrl }) => {
        if (pictureUrl) {
          pictureMap.set(email, pictureUrl);
        }
      });
      setAssigneeProfilePictures(pictureMap);
    };

    fetchAssigneeProfilePictures();
  }, [assignees]);

  // Convert notes to Message format (memoized to prevent cascade re-renders)
  const notesAsMessages = useMemo<Message[]>(() => {
    return Object.entries(notes).map(([noteID, note]) => ({
      id: noteID,
      timestamp: note.timestamp,
      originalId: noteID,
      intent: INTENT.NONE,
      message: {
        role: 'assistant',
        content: note.content,
      },
      type: 'note' as const,
      key: note.creator,
    }));
  }, [notes]);

  // Convert assignees to Message format (memoized to prevent cascade re-renders)
  const assigneesAsMessages = useMemo<Message[]>(() => {
    return Object.entries(assignees).map(([assigneeID, assigneeData]) => {
      const assigneeName =
        assigneeData.assignee === 'none'
          ? t('Unassigned')
          : collaborators.find((c) => c.email === assigneeData.assignee)?.name ||
            assigneeData.assignee;

      return {
        id: assigneeID,
        timestamp: assigneeData.timestamp,
        originalId: assigneeID,
        intent: INTENT.NONE,
        message: {
          role: 'assistant',
          content: assigneeName,
        },
        type: 'assignee-change' as const,
        key: assigneeData.assignee,
      };
    });
  }, [assignees, t, collaborators]);

  // Convert statuses to Message format (memoized to prevent cascade re-renders)
  const statusesAsMessages = useMemo<Message[]>(() => {
    const getStatusLabel = (statusValue: string): string => {
      switch (statusValue) {
        case 'open':
          return t('chat-status-open');
        case 'blocked':
          return t('chat-status-blocked');
        case 'closed':
          return t('chat-status-closed');
        case 'verify-payment':
          return t('chat-status-verify-payment');
        default:
          return statusValue;
      }
    };

    return Object.entries(statuses).map(([statusID, statusData]) => {
      return {
        id: statusID,
        timestamp: statusData.timestamp,
        originalId: statusID,
        intent: INTENT.NONE,
        message: {
          role: 'assistant',
          content: getStatusLabel(statusData.status),
        },
        type: 'status-change' as const,
        key: statusData.status,
      };
    });
  }, [statuses, t]);

  // Sort and filter messages
  const regularMessages = useMemo(() => {
    const seenIds = new Set<string>();
    const result = Object.values(messages).filter((message) => {
      if (seenIds.has(message.id)) {
        return false;
      }
      seenIds.add(message.id);

      return (
        message.message &&
        (message.message.role === 'assistant' || message.message.role === 'user') &&
        !message.key?.endsWith('-invisible') &&
        (message.message.content || message.mediaUrl)
      );
    });

    return result;
  }, [messages]);

  // Merge messages, notes, assignees, and statuses, then sort by timestamp
  const sortedMessages = useMemo(() => {
    return [...regularMessages, ...notesAsMessages, ...assigneesAsMessages, ...statusesAsMessages].sort(
      (a, b) => a.timestamp - b.timestamp
    );
  }, [regularMessages, notesAsMessages, assigneesAsMessages, statusesAsMessages]);

  // Group messages by date
  const groupedByDate = useMemo(() => {
    return sortedMessages.reduce(
      (groups, message) => {
        const dateKey = formatTimestamp(message.timestamp, false, true);
        if (!groups[dateKey]) {
          groups[dateKey] = [];
        }
        groups[dateKey].push(message);
        return groups;
      },
      {} as Record<string, typeof sortedMessages>
    );
  }, [sortedMessages]);

  // Create flattened items for virtualization (date headers + messages)
  const virtualizedItems = useMemo<VirtualizedItem[]>(() => {
    const items: VirtualizedItem[] = [];

    Object.entries(groupedByDate).forEach(([dateKey, messagesInDate]) => {
      items.push({
        type: 'date-header',
        id: `header-${dateKey}`,
        date: dateKey,
      });

      messagesInDate.forEach((message) => {
        items.push({
          type: 'message',
          id: message.id,
          message,
          isNote: message.type === 'note',
          isAssigneeChange: message.type === 'assignee-change',
          isStatusChange: message.type === 'status-change',
        });
      });
    });

    return items;
  }, [groupedByDate]);

  // Compute firstItemIndex for prepending support
  // Dispatch on every render to let reducer decide if state needs updating
  const currentCount = virtualizedItems.length;

  useEffect(() => {
    dispatchPrepend({ currentCount, chatId: chatId || null });
  }, [currentCount, chatId]);

  const firstItemIndex = prependState.firstItemIndex;

  // Scroll to highlighted message when it changes
  useEffect(() => {
    if (highlightedMessageId && virtuosoRef.current) {
      const index = virtualizedItems.findIndex(
        (item) => item.type === 'message' && item.id === highlightedMessageId
      );
      if (index >= 0) {
        virtuosoRef.current.scrollToIndex({
          index,
          align: 'end',
          behavior: 'smooth',
        });
      }
    }
  }, [highlightedMessageId, virtualizedItems]);

  // Ref for virtualizedItems to use in stable callbacks
  const virtualizedItemsRef = useRef(virtualizedItems);
  useEffect(() => {
    virtualizedItemsRef.current = virtualizedItems;
  }, [virtualizedItems]);

  // Helper to get previous message item for role change detection - stable callback using ref
  const getPreviousMessageItem = useCallback((currentIndex: number): Message | null => {
    for (let i = currentIndex - 1; i >= 0; i--) {
      const item = virtualizedItemsRef.current[i];
      if (item && item.type === 'message') {
        return item.message;
      }
    }
    return null;
  }, []);

  // Handle reaching the top of the list (load older messages)
  const handleStartReached = useCallback(() => {
    if (loadOlderMessages && hasMoreOlderMessages && !isLoadingOlderMessages && !isLoadingOlderRef.current) {
      isLoadingOlderRef.current = true;
      loadOlderMessages().finally(() => {
        isLoadingOlderRef.current = false;
      });
    }
  }, [loadOlderMessages, hasMoreOlderMessages, isLoadingOlderMessages]);

  // Refs for context values that change frequently but shouldn't trigger re-renders
  const sortedMessagesRef = useRef(sortedMessages);
  const noteProfilePicturesRef = useRef(noteProfilePictures);
  const assigneeProfilePicturesRef = useRef(assigneeProfilePictures);
  const highlightedMessageIdRef = useRef(highlightedMessageId);
  const messagesRef = useRef(messages);

  useEffect(() => {
    sortedMessagesRef.current = sortedMessages;
  }, [sortedMessages]);
  useEffect(() => {
    noteProfilePicturesRef.current = noteProfilePictures;
  }, [noteProfilePictures]);
  useEffect(() => {
    assigneeProfilePicturesRef.current = assigneeProfilePictures;
  }, [assigneeProfilePictures]);
  useEffect(() => {
    highlightedMessageIdRef.current = highlightedMessageId;
  }, [highlightedMessageId]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Stable callbacks that use refs internally
  const stableFindRepliedMessage = useCallback((replyId: string): Message | null => {
    const messageEntries = Object.entries(messagesRef.current);
    for (const [, message] of messageEntries) {
      if (message.originalId === replyId) {
        return message;
      }
    }
    return null;
  }, []);

  const stableGetStatusDisplay = useCallback(
    (statusValue: string) => {
      switch (statusValue) {
        case 'open':
          return {
            label: t('chat-status-open'),
            textColor: 'text-gray-600',
            bgColor: 'bg-gray-50 dark:bg-gray-800',
            borderColor: 'border-gray-300',
          };
        case 'blocked':
          return {
            label: t('chat-status-blocked'),
            textColor: 'text-yellow-600',
            bgColor: 'bg-yellow-50',
            borderColor: 'border-yellow-300',
          };
        case 'closed':
          return {
            label: t('chat-status-closed'),
            textColor: 'text-green-700 dark:text-green-400',
            bgColor: 'bg-green-50 dark:bg-background',
            borderColor: 'border-green-300 dark:border-green-400',
          };
        case 'verify-payment':
          return {
            label: t('chat-status-verify-payment'),
            textColor: 'text-amber-600',
            bgColor: 'bg-amber-50',
            borderColor: 'border-amber-300',
          };
        default:
          return {
            label: statusValue,
            textColor: 'text-gray-600',
            bgColor: 'bg-gray-50',
            borderColor: 'border-gray-300',
          };
      }
    },
    [t]
  );

  // Create context value with stable callbacks
  const contextValue = useMemo<MessageContextValue>(
    () => ({
      isTestChatActive,
      findRepliedMessage: stableFindRepliedMessage,
      handleReplyClick,
      onAskAI,
      getStatusDisplay: stableGetStatusDisplay,
      t,
    }),
    [isTestChatActive, stableFindRepliedMessage, handleReplyClick, onAskAI, stableGetStatusDisplay, t]
  );

  // Render a single item (date header or message)
  const renderItem = useCallback(
    (index: number, item: VirtualizedItem) => {
      // Return a minimal placeholder if item not found - prevents zero-sized element warnings
      if (!item) return <div style={{ minHeight: 1 }} />;
      if (item.type === 'date-header') {
        return (
          <div className="w-full flex justify-center my-2">
            <Badge
              variant="secondary"
              className="bg-background cursor-default font-bold border-1 border-border text-muted-foreground"
            >
              {item.date === 'Today'
                ? t('Today')
                : item.date.length > 1
                  ? item.date.substring(0, 1).toUpperCase() + item.date.substring(1)
                  : item.date.toUpperCase()}
            </Badge>
          </div>
        );
      }

      // Get previous message for role change detection
      const previousMessage = getPreviousMessageItem(index);

      // Compute per-item derived values from refs (safe inside useCallback)
      const msg = item.message;
      const itemIsHighlighted = highlightedMessageIdRef.current === msg.id;

      const noteCreator = item.isNote ? msg.key : null;
      const itemNoteProfilePicUrl = noteCreator
        ? noteProfilePicturesRef.current.get(noteCreator)
        : null;

      const assigneeEmail = item.isAssigneeChange ? msg.key : null;
      const isUnassigned = assigneeEmail === 'none';
      const itemAssigneeProfilePicUrl =
        assigneeEmail && !isUnassigned
          ? assigneeProfilePicturesRef.current.get(assigneeEmail)
          : null;

      const isAssistantMsg =
        msg.message.role === 'assistant' && !item.isNote && !item.isAssigneeChange && !item.isStatusChange;
      const itemHasUserReplyAfter = isAssistantMsg
        ? sortedMessagesRef.current.some(
            (m) =>
              m.timestamp > msg.timestamp &&
              m.message.role === 'user' &&
              m.type !== 'note' &&
              m.type !== 'assignee-change' &&
              m.type !== 'status-change'
          )
        : false;

      return (
        <MessageItemComponent
          item={item}
          previousMessage={previousMessage}
          imageOrientation={imageOrientationsRef.current[msg.id]}
          onImageLoad={handleImageLoad}
          onImageRef={handleImageRef}
          isHighlighted={itemIsHighlighted}
          noteProfilePicUrl={itemNoteProfilePicUrl}
          assigneeProfilePicUrl={itemAssigneeProfilePicUrl}
          hasUserReplyAfter={itemHasUserReplyAfter}
        />
      );
    },
    [getPreviousMessageItem, handleImageLoad, handleImageRef, t]
  );

  // Show loading spinner while messages are being fetched
  if (isLoadingMessages) {
    return (
      <div
        className={`overflow-y-auto z-20 flex-1 flex flex-col items-center justify-center p-4 ${className}`}
      >
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  // Show empty state when loading is done but there are no messages
  // Important: Don't render Virtuoso with 0 items because initialTopMostItemIndex
  // is only read on mount and scroll position would be wrong.
  if (virtualizedItems.length === 0) {
    return (
      <div
        className={`overflow-y-auto z-20 flex-1 flex flex-col items-center justify-center p-4 ${className}`}
      >
        <MessageCircle className="text-gray-300 mb-3" size={48} />
        <p className="text-gray-400 text-sm">{t('No messages yet')}</p>
      </div>
    );
  }

  return (
    <MessageContext.Provider value={contextValue}>
      <div className={`z-20 flex-1 relative overflow-hidden ${className}`}>
        <div className={`w-full h-full absolute overflow-hidden ${className}`}>
          <Virtuoso<VirtualizedItem>
            ref={virtuosoRef}
            style={{ height: '100%', width: '100%' }}
            data={virtualizedItems}
            itemContent={renderItem}
            firstItemIndex={firstItemIndex}
            initialTopMostItemIndex={virtualizedItems.length - 1}
            startReached={handleStartReached}
            // Stable key generation for each item to prevent unnecessary re-renders
            computeItemKey={(index: number, item: VirtualizedItem) => item?.id || `item-${index}`}
            // Increase overscan to reduce flickering during fast scroll
            overscan={200}
            // Keep more items rendered to reduce mount/unmount cycles
            increaseViewportBy={{ top: 400, bottom: 400 }}
            components={{
              Header: () =>
                isLoadingOlderMessages ? (
                  <div className="w-full flex justify-center py-2">
                    <Loader2 className="animate-spin text-gray-400" size={20} />
                  </div>
                ) : null,
              List: VirtuosoList,
            }}
          />
        </div>
      </div>
    </MessageContext.Provider>
  );
};

// Memoize to prevent re-renders when messages haven't changed
export const MessageView = memo(MessageViewComponent);

MessageView.displayName = 'MessageView';
