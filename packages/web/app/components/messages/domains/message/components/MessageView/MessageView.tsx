import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Avatar from 'react-nice-avatar';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

import { CheckCheck, ChevronDown, Loader2, MessageCircle, Sparkles } from 'lucide-react';

import type { Note } from '@services/api';
import { getUserPictureByEmailCached } from '@services/api';

import { MessageReplyPreview } from '@components/messageReplyPreview';
import { Badge } from '@components/ui/badge';

import { generateAvatarConfig } from '@globalUtils/avatar';
import { getMessageText } from '@globalUtils/message';
import { formatTimestamp, formatWhatsapp } from '@globalUtils/strs';

import { Conversation, INTENT, Message } from '@globalTypes/chat';
import { Collaborator } from '@globalTypes/projectInnerSettings';

import { Slot } from '../../../../core/slots';
import { AudioPlayer } from './AudioPlayer';

import PDFImg from '@assets/pdfIcon.webp';

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
 * Uses refs for values that change frequently to prevent context-triggered re-renders
 */
interface MessageContextValue {
  isTestChatActive: boolean;
  highlightedMessageId: string | null; // Deprecated, use ref
  findRepliedMessage: (replyId: string) => Message | null;
  handleReplyClick: (messageId: string) => void;
  onAskAI?: (messageText: string) => void;
  getStatusDisplay: (statusValue: string) => {
    label: string;
    textColor: string;
    bgColor: string;
    borderColor: string;
  };
  noteProfilePictures: Map<string, string>; // Deprecated, use ref
  assigneeProfilePictures: Map<string, string>; // Deprecated, use ref
  sortedMessages: Message[]; // Deprecated, use ref
  t: (key: string) => string;
  // Refs for frequently changing values
  highlightedMessageIdRef: React.MutableRefObject<string | null>;
  sortedMessagesRef: React.MutableRefObject<Message[]>;
  noteProfilePicturesRef: React.MutableRefObject<Map<string, string>>;
  assigneeProfilePicturesRef: React.MutableRefObject<Map<string, string>>;
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
}

const MessageItemComponent = memo<MessageItemComponentProps>(
  ({ item, previousMessage, imageOrientation, onImageLoad, onImageRef }) => {
    const context = React.useContext(MessageContext);
    const [isHovered, setIsHovered] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [hoveredDropdownOption, setHoveredDropdownOption] = useState<string | null>(null);
    const [dropdownPosition, setDropdownPosition] = useState<'above' | 'below'>('above');
    const [dropdownHorizontalOffset, setDropdownHorizontalOffset] = useState<number>(0);
    const dropdownTriggerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const positionCalculatedRef = useRef<boolean>(false);
    const highlightedMessageRef = useRef<HTMLDivElement>(null);

    if (!context) return null;

    const {
      isTestChatActive,
      findRepliedMessage,
      handleReplyClick,
      onAskAI,
      getStatusDisplay,
      t,
      // Use refs for frequently changing values to avoid re-renders
      highlightedMessageIdRef,
      sortedMessagesRef,
      noteProfilePicturesRef,
      assigneeProfilePicturesRef,
    } = context;

    const { message, isNote, isAssigneeChange, isStatusChange } = item;

    const styleAsAssistant =
      isTestChatActive && message.message.role === 'assistant'
        ? true
        : isTestChatActive && message.message.role !== 'assistant'
          ? false
          : message.message.role === 'assistant'
            ? false
            : true;

    // Use refs for values that change frequently
    const isHighlighted = highlightedMessageIdRef.current === message.id;
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

    // Get note creator info - use ref
    const noteCreator = isNote ? message.key : null;
    const noteProfilePicUrl = noteCreator ? noteProfilePicturesRef.current.get(noteCreator) : null;
    const noteAvatarConfig = noteCreator ? generateAvatarConfig(noteCreator) : null;

    // Get assignee info - use ref
    const assigneeEmail = isAssigneeChange ? message.key : null;
    const isUnassigned = assigneeEmail === 'none';
    const assigneeProfilePicUrl =
      assigneeEmail && !isUnassigned ? assigneeProfilePicturesRef.current.get(assigneeEmail) : null;
    const assigneeAvatarConfig = assigneeEmail && !isUnassigned ? generateAvatarConfig(assigneeEmail) : null;

    // Get status display info
    const statusValue = isStatusChange ? message.key : null;
    const statusDisplay = statusValue ? getStatusDisplay(statusValue) : null;

    // Check if there's a user message after this assistant message - use ref
    const isAssistantMessage =
      message.message.role === 'assistant' && !isNote && !isAssigneeChange && !isStatusChange;
    const hasUserReplyAfter = isAssistantMessage
      ? sortedMessagesRef.current.some(
          (m) =>
            m.timestamp > message.timestamp &&
            m.message.role === 'user' &&
            m.type !== 'note' &&
            m.type !== 'assignee-change' &&
            m.type !== 'status-change'
        )
      : false;

    // Handle click outside to close dropdown
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
          positionCalculatedRef.current = false;
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isDropdownOpen]);

    // Calculate dropdown position when dropdown opens
    useEffect(() => {
      if (!isDropdownOpen || positionCalculatedRef.current) {
        return;
      }

      requestAnimationFrame(() => {
        if (!dropdownTriggerRef.current) {
          setDropdownPosition('above');
          setDropdownHorizontalOffset(0);
          positionCalculatedRef.current = true;
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
        positionCalculatedRef.current = true;
      });
    }, [isDropdownOpen]);

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
          <div className="flex-1 border-b border-dashed border-gray-300 mr-2" />
        )}

        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`${hasImage && imageOrientation ? 'px-0 pt-0 pb-[2px]' : 'p-1 pt-1 pb-[2px]'} rounded-lg relative flex flex-col ${
            isNote || isAssigneeChange || isStatusChange ? 'w-[255px]' : 'max-w-[70%]'
          } ${
            isNote
              ? 'bg-yellow-50 border border-yellow-300 text-[#111111]'
              : isAssigneeChange
                ? 'bg-white border border-gray-300 text-[#111111]'
                : isStatusChange && statusDisplay
                  ? `${statusDisplay.bgColor} border ${statusDisplay.borderColor} text-[#111111]`
                  : styleAsAssistant
                    ? 'bg-[#f3f7fe] text-[#111111]'
                    : 'bg-[#f7f7f7] border-[#c4dbf0]'
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
              className={`absolute top-2 right-2 z-20 rounded ${
                isHighlighted ? 'bg-[#fff3cd]' : styleAsAssistant ? 'bg-[#f3f7fe]' : 'bg-[#f7f7f7]'
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDropdownOpen(!isDropdownOpen);
                }}
                className="w-6 h-6 flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronDown size={16} className="text-gray-500 hover:text-gray-700" />
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
                    visibility: positionCalculatedRef.current ? 'visible' : 'hidden',
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
                    <img
                      ref={(el) => onImageRef(el, message.id)}
                      onLoad={(e) => onImageLoad(e, message.id)}
                      src={message.mediaUrl}
                      alt=""
                      className="absolute w-px h-px opacity-0 pointer-events-none"
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
                  <img
                    className="h-auto block rounded-[5px] cursor-pointer"
                    style={{ width }}
                    src={message.mediaUrl}
                    alt="Message attachment"
                  />
                </a>
              );
            })()}

          {/* PDF/Document media */}
          {message.mediaUrl && (message.type === 'pdf' || message.type === 'document') && (
            <a href={message.mediaUrl} target="_blank" rel="noreferrer">
              <div className="cursor-pointer border border-[#e4e4e7] p-4 overflow-hidden flex justify-center items-center w-full h-[100px]">
                <img
                  src={PDFImg}
                  alt="PDF"
                  className="h-full w-auto object-contain object-center"
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
                  <img
                    src={noteProfilePicUrl}
                    alt={noteCreator || 'Creator'}
                    className="w-5 h-5 rounded-full object-cover"
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
                    <img
                      src={assigneeProfilePicUrl}
                      alt={assigneeEmail || 'Assignee'}
                      className="w-5 h-5 rounded-full object-cover"
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
                  isNote ? 'text-gray-600 text-right text-xs!' : 'text-black'
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
      prevProps.previousMessage?.id === nextProps.previousMessage?.id
    );
  }
);

MessageItemComponent.displayName = 'MessageItemComponent';

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
  const { t } = useTranslation();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const previousChatIdRef = useRef<string | null>(null);
  const [, setImageOrientations] = useState<Record<string, 'landscape' | 'portrait'>>({});
  // Ref mirror of imageOrientations to avoid callback recreation
  const imageOrientationsRef = useRef<Record<string, 'landscape' | 'portrait'>>({});
  const [noteProfilePictures, setNoteProfilePictures] = useState<Map<string, string>>(new Map());
  const [assigneeProfilePictures, setAssigneeProfilePictures] = useState<Map<string, string>>(new Map());

  // Track if loading older messages
  const isLoadingOlderRef = useRef(false);

  // Refs for stable access to frequently-changing props (prevents useMemo invalidation)
  const collaboratorsRef = useRef(collaborators);
  collaboratorsRef.current = collaborators;
  const tRef = useRef(t);
  tRef.current = t;

  // Stable references for object props - only update when content actually changes
  // This prevents useMemo invalidation when parent creates new object references with same data
  const stableNotesRef = useRef(notes);
  const stableAssigneesRef = useRef(assignees);
  const stableStatusesRef = useRef(statuses);
  const prevNotesKeyRef = useRef<string>('');
  const prevAssigneesKeyRef = useRef<string>('');
  const prevStatusesKeyRef = useRef<string>('');

  // Update stable refs only when content changes (shallow key comparison for performance)
  const notesKey = Object.keys(notes).sort().join(',');
  if (notesKey !== prevNotesKeyRef.current) {
    prevNotesKeyRef.current = notesKey;
    stableNotesRef.current = notes;
  }

  const assigneesKey = Object.keys(assignees).sort().join(',');
  if (assigneesKey !== prevAssigneesKeyRef.current) {
    prevAssigneesKeyRef.current = assigneesKey;
    stableAssigneesRef.current = assignees;
  }

  const statusesKey = Object.keys(statuses).sort().join(',');
  if (statusesKey !== prevStatusesKeyRef.current) {
    prevStatusesKeyRef.current = statusesKey;
    stableStatusesRef.current = statuses;
  }

  // For prepending older messages - track firstItemIndex
  // We use a high starting index so we have room to prepend items
  const INITIAL_ITEM_INDEX = 100000;
  const firstItemIndexRef = useRef(INITIAL_ITEM_INDEX);
  const previousItemCountRef = useRef(0);
  const previousChatIdForPrependRef = useRef<string | null>(null);

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
  // Use stable ref and key as dependency to only recalculate when content actually changes
  const notesAsMessages = useMemo<Message[]>(() => {
    return Object.entries(stableNotesRef.current).map(([noteID, note]) => ({
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
  }, [notesKey]);

  // Convert assignees to Message format (memoized to prevent cascade re-renders)
  // Uses refs for collaborators and t to prevent invalidation from parent re-renders
  // Use stable ref and key as dependency to only recalculate when content actually changes
  const assigneesAsMessages = useMemo<Message[]>(() => {
    return Object.entries(stableAssigneesRef.current).map(([assigneeID, assigneeData]) => {
      const assigneeName =
        assigneeData.assignee === 'none'
          ? tRef.current('Unassigned')
          : collaboratorsRef.current.find((c) => c.email === assigneeData.assignee)?.name ||
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
  }, [assigneesKey]);

  // Convert statuses to Message format (memoized to prevent cascade re-renders)
  // Use stable ref and key as dependency to only recalculate when content actually changes
  const statusesAsMessages = useMemo<Message[]>(() => {
    // Inline status label resolution to avoid dependency on getStatusDisplay callback
    const getStatusLabel = (statusValue: string): string => {
      switch (statusValue) {
        case 'open':
          return tRef.current('chat-status-open');
        case 'blocked':
          return tRef.current('chat-status-blocked');
        case 'closed':
          return tRef.current('chat-status-closed');
        case 'verify-payment':
          return tRef.current('chat-status-verify-payment');
        default:
          return statusValue;
      }
    };

    return Object.entries(stableStatusesRef.current).map(([statusID, statusData]) => {
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
  }, [statusesKey]);

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
  // This runs during render to ensure synchronous updates before Virtuoso renders
  const currentCount = virtualizedItems.length;
  const previousCount = previousItemCountRef.current;

  if (previousChatIdForPrependRef.current !== chatId) {
    // Chat changed - reset to initial state

    firstItemIndexRef.current = INITIAL_ITEM_INDEX;
    previousItemCountRef.current = currentCount;
    previousChatIdForPrependRef.current = chatId || null;
  } else if (previousCount > 0 && currentCount > previousCount) {
    // Items were prepended - decrease firstItemIndex to maintain scroll position
    // This tells Virtuoso that new items were added at the beginning
    const itemsAdded = currentCount - previousCount;
    firstItemIndexRef.current -= itemsAdded;
    previousItemCountRef.current = currentCount;
  } else if (currentCount < previousCount) {
    previousItemCountRef.current = currentCount;
  } else {
    previousItemCountRef.current = currentCount;
  }

  const firstItemIndex = firstItemIndexRef.current;

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
  virtualizedItemsRef.current = virtualizedItems;

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
  sortedMessagesRef.current = sortedMessages;
  const noteProfilePicturesRef = useRef(noteProfilePictures);
  noteProfilePicturesRef.current = noteProfilePictures;
  const assigneeProfilePicturesRef = useRef(assigneeProfilePictures);
  assigneeProfilePicturesRef.current = assigneeProfilePictures;
  const highlightedMessageIdRef = useRef(highlightedMessageId);
  highlightedMessageIdRef.current = highlightedMessageId;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

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

  const stableGetStatusDisplay = useCallback((statusValue: string) => {
    switch (statusValue) {
      case 'open':
        return {
          label: tRef.current('chat-status-open'),
          textColor: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-300',
        };
      case 'blocked':
        return {
          label: tRef.current('chat-status-blocked'),
          textColor: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-300',
        };
      case 'closed':
        return {
          label: tRef.current('chat-status-closed'),
          textColor: 'text-green-700',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-300',
        };
      case 'verify-payment':
        return {
          label: tRef.current('chat-status-verify-payment'),
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
  }, []);

  // Create context value - now with stable references
  // Using refs means the context value itself is stable and won't cause re-renders
  const contextValue = useMemo<MessageContextValue>(
    () => ({
      isTestChatActive,
      highlightedMessageId: null, // Use ref inside component instead
      findRepliedMessage: stableFindRepliedMessage,
      handleReplyClick,
      onAskAI,
      getStatusDisplay: stableGetStatusDisplay,
      noteProfilePictures: new Map(), // Use ref inside component instead
      assigneeProfilePictures: new Map(), // Use ref inside component instead
      sortedMessages: [], // Use ref inside component instead
      t: tRef.current,
      // Provide refs for values that change
      highlightedMessageIdRef,
      sortedMessagesRef,
      noteProfilePicturesRef,
      assigneeProfilePicturesRef,
    }),
    [isTestChatActive, stableFindRepliedMessage, handleReplyClick, onAskAI, stableGetStatusDisplay]
  );

  // Render a single item (date header or message)
  // This callback is now stable - uses refs for all frequently changing values
  const renderItem = useCallback(
    (index: number, item: VirtualizedItem) => {
      // Return a minimal placeholder if item not found - prevents zero-sized element warnings
      if (!item) return <div style={{ minHeight: 1 }} />;
      if (item.type === 'date-header') {
        return (
          <div className="w-full flex justify-center my-2">
            <Badge
              variant="secondary"
              className="bg-white cursor-default font-bold border-1 border-gray-200 text-gray-600"
            >
              {item.date === 'Today'
                ? tRef.current('Today')
                : item.date.length > 1
                  ? item.date.substring(0, 1).toUpperCase() + item.date.substring(1)
                  : item.date.toUpperCase()}
            </Badge>
          </div>
        );
      }

      // Get previous message for role change detection
      const previousMessage = getPreviousMessageItem(index);

      return (
        <MessageItemComponent
          item={item}
          previousMessage={previousMessage}
          imageOrientation={imageOrientationsRef.current[item.message.id]}
          onImageLoad={handleImageLoad}
          onImageRef={handleImageRef}
        />
      );
    },
    [getPreviousMessageItem, handleImageLoad, handleImageRef]
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
            computeItemKey={(index, item) => item?.id || `item-${index}`}
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
