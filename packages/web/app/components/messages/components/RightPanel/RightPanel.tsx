
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import NextImage from 'next/image';
import Avatar from 'react-nice-avatar';
import { useParams } from 'next/navigation';

import {
  AtSign,
  ChevronDown,
  ChevronRight,
  CircleUser,
  ClipboardList,
  History,
  IdCard,
  Image as ImageIcon,
  Map as MapIcon,
  MapPin,
  NotepadText,
  Tag,
  VenusAndMars,
  X,
} from 'lucide-react';

import {
  deleteNote,
  getActivity,
  getFinalUserInfo,
  getNotes,
  getUserPictureByEmailCached,
  setChatTags,
} from '@/app/components/messages/services/api';

import { TAG_COLORS } from '@/app/components/messages/chatSettings/tagsUtils';

import { MultiSelect } from '@/app/components/messages/shared/stubs';
import type { MultiSelectOption } from '@/app/components/messages/shared/stubs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

import { generateAvatarConfig } from '@/app/utils/avatar';
import { useIsMobile } from '@/app/utils/device';
import { formatTimestamp, formatWhatsapp } from '@/app/utils/strs';

import { cn } from '@/lib/utils';

import type { Conversation } from '@/app/types/chat';
import { FinalUserInfoAPI } from '@/app/types/finalUsers';

import { useChat } from '../../core/contexts';
import { Slot } from '../../core/slots';
import { UserCard } from './UserCard';

interface UserInfoCache {
  [chatId: string]: FinalUserInfoAPI;
}

interface RightPanelProps {
  activeChat: string | null;
  messages: Conversation;
  onMessageClick?: (messageId: string) => void;
  forceRender?: boolean;
  isAIEnabled?: boolean;
  onAIToggle?: (enabled: boolean) => void;
  isTestChat?: boolean;
}

interface SectionItem {
  id: string;
  element: React.JSX.Element;
}

interface Section {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: SectionItem[];
  className: string;
}

const iconSize = 16;

/**
 * RightPanel
 *
 * Information panel displayed to the right of the chat view.
 * Shows contact details, chat metadata, and related information.
 * Only visible when a chat is active and user is not on mobile.
 */
const RightPanelComponent: React.FC<RightPanelProps> = ({
  activeChat,
  messages,
  onMessageClick,
  forceRender,
  isAIEnabled = false,
  onAIToggle,
  isTestChat = false,
}) => {
  const t = useTranslations('messages');
  const locale = useLocale();
  const params = useParams();
  const projectName = typeof params.projectName === 'string' ? params.projectName : params.projectName?.[0] ?? '';
  const isMobile = useIsMobile();
  const {
    notes,
    setNotes,
    notesRefreshTrigger,
    triggerNotesRefresh,
    activities,
    setActivities,
    availableTags,
    currentChat,
    updateChatTags,
  } = useChat();

  // Ref to track the current active chat (to prevent race conditions)
  const activeChatRef = useRef<string | null>(activeChat);

  // State for caching user info per chat
  const [userInfoCache, setUserInfoCache] = useState<UserInfoCache>({});
  const [currentUserInfo, setCurrentUserInfo] = useState<FinalUserInfoAPI | null>(null);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['info', 'notes', 'tags', 'activity', 'media'])
  );

  // State for note creator profile pictures
  const [noteProfilePictures, setNoteProfilePictures] = useState<Map<string, string>>(new Map());

  // State for delete confirmation dialog
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // State for selected tags per chat
  const [selectedTagsByChat, setSelectedTagsByChat] = useState<Record<string, string[]>>({});

  // Update ref whenever activeChat changes
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  // Calculate member since date from first message
  const memberSince = useMemo(() => {
    if (!messages || Object.keys(messages).length === 0) {
      return t('Unknown');
    }

    // Find the oldest message (first message)
    const messageArray = Object.values(messages);
    const oldestMessage = messageArray.reduce((oldest, current) => {
      return current.timestamp < oldest.timestamp ? current : oldest;
    });

    // Format the date using the user's locale
    const date = new Date(oldestMessage.timestamp);
    return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }, [messages, t, locale]);

  // Extract images from conversation messages
  const mediaImages = useMemo(() => {
    if (!messages || Object.keys(messages).length === 0) {
      return [];
    }

    // Filter messages that have media URLs and are image or video type
    const messageArray = Object.values(messages);
    return messageArray
      .filter((msg) => msg.mediaUrl && (msg.type === 'image' || msg.type === 'video'))
      .map((msg) => ({
        id: msg.id,
        url: msg.mediaUrl || '',
        type: msg.type,
        timestamp: msg.timestamp,
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // Sort by newest first
  }, [messages]);

  // Effect to fetch user info and notes when activeChat changes
  useEffect(() => {
    const run = async () => {
      if (!activeChat || !projectName) {
        // Clear notes and activities when no chat is active
        setNotes({});
        setActivities({});
        setCurrentUserInfo(null);
        return;
      }

      // Capture the current chat ID at the time of the effect
      const chatIdAtFetchTime = activeChat;

      // Show cached data immediately if available
      if (userInfoCache[chatIdAtFetchTime]) {
        setCurrentUserInfo(userInfoCache[chatIdAtFetchTime]);
      }

      // Fetch all data in parallel
      await Promise.all([
        fetchUserInfoData(projectName, chatIdAtFetchTime),
        fetchNotesData(projectName, chatIdAtFetchTime),
        fetchActivitiesData(projectName, chatIdAtFetchTime),
      ]);
    };

    const fetchUserInfoData = async (project: string, chatId: string) => {
      try {
        const userInfo = await getFinalUserInfo(project, chatId);
        if (activeChatRef.current === chatId) {
          setCurrentUserInfo(userInfo);
          setUserInfoCache((prev) => ({ ...prev, [chatId]: userInfo }));
        }
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    };

    const fetchNotesData = async (project: string, chatId: string) => {
      try {
        const fetchedNotes = await getNotes(project, chatId);
        if (activeChatRef.current === chatId) {
          setNotes(fetchedNotes);
        }
      } catch (error) {
        console.error('Error fetching notes:', error);
      }
    };

    const fetchActivitiesData = async (project: string, chatId: string) => {
      try {
        const fetchedActivities = await getActivity(project, chatId);
        if (activeChatRef.current === chatId) {
          setActivities(fetchedActivities);
        }
      } catch (error) {
        console.error('Error fetching activities:', error);
      }
    };

    run();
  }, [activeChat, projectName, notesRefreshTrigger, setActivities, setNotes, userInfoCache]);

  // Initialize selected tags from currentChat when chat changes
  useEffect(() => {
    const run = async () => {
      if (!activeChat || !currentChat) return;

      // Initialize tags from currentChat if not already set
      if (!selectedTagsByChat[activeChat] && currentChat.tags) {
        setSelectedTagsByChat((prev) => ({
          ...prev,
          [activeChat]: currentChat.tags || [],
        }));
      }
    };

    run();
  }, [activeChat, currentChat, selectedTagsByChat]);

  // Handle note deletion
  const handleDeleteNote = async () => {
    if (!deleteNoteId || !activeChat || !projectName) return;

    const success = await deleteNote(projectName, activeChat, deleteNoteId);

    if (success) {
      // Trigger notes refresh
      triggerNotesRefresh();
      setIsDeleteDialogOpen(false);
      setDeleteNoteId(null);
    } else {
      // Could add error toast here
      console.error('Failed to delete note');
    }
  };

  // Open delete confirmation dialog
  const handleDeleteClick = (noteID: string) => {
    setDeleteNoteId(noteID);
    setIsDeleteDialogOpen(true);
  };

  // Handle tag selection changes
  const handleTagsChange = useCallback(
    async (tagIds: string[]) => {
      if (!activeChat || !projectName) return;

      // Update local state
      setSelectedTagsByChat((prev) => ({
        ...prev,
        [activeChat]: tagIds,
      }));

      // Update LastMessage cache
      updateChatTags(activeChat, tagIds);

      // Save tags to backend
      try {
        const success = await setChatTags(projectName, activeChat, tagIds);
        if (!success) {
          console.error(`[RightPanel] Failed to update tags for chat ${activeChat}`);
        }
      } catch (error) {
        console.error('[RightPanel] Error updating tags:', error);
      }
    },
    [activeChat, projectName, updateChatTags]
  );

  // Effect to fetch profile pictures for note creators
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

  const firstUppercase = (str: string) => str.substring(0, 1).toUpperCase() + str.substring(1);

  // Convert tags to MultiSelectOption format with colored dots
  const tagOptions: MultiSelectOption[] = useMemo(() => {
    return availableTags.map((tag) => {
      const isPredefinedTag = TAG_COLORS[tag.tagID];
      const tagColor = isPredefinedTag ? TAG_COLORS[tag.tagID] : '#6b7280';

      // For predefined tags, use translation; for custom tags, use tag name
      const label = isPredefinedTag ? firstUppercase(t(`tag-${tag.tagID}`)) : firstUppercase(tag.tag);

      // Create a colored dot icon component
      const ColoredDot = ({ className }: { className?: string }) => (
        <div
          className={className}
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: tagColor,
            display: 'inline-block',
          }}
        />
      );

      return {
        label,
        value: tag.tagID,
        icon: ColoredDot,
      };
    });
  }, [availableTags, t]);

  const infoIconSize = 14;
  const infoLabelClassname = 'flex gap-1 items-center text-gray-500 cursor-default text-xs';
  const infoValueClassname = 'text-xs text-black ml-0 flex';

  const cardClass =
    'cursor-default relative w-full border p-3 py-1 rounded-lg bg-white shadow-lg overflow-hidden';

  const sections: Section[] = useMemo(
    () => [
      {
        id: 'info',
        label: t('Contact Info'),
        icon: <ClipboardList size={iconSize} />,
        className: '',
        items: [
          {
            id: '1',
            element: (
              <div className="w-full flex flex-col items-start justify-between border-b py-1.5 gap-0.5">
                <div className={infoLabelClassname}>
                  <CircleUser size={infoIconSize} />
                  {t('Name')}:
                </div>
                <div className={infoValueClassname}>
                  {firstUppercase(currentUserInfo?.name || t('Unknown'))}
                </div>
              </div>
            ),
          },
          {
            id: '2',
            element: (
              <div className="w-full flex flex-col items-start justify-between border-b py-1.5 gap-0.5">
                <div className={infoLabelClassname}>
                  <VenusAndMars size={infoIconSize} />
                  {t('Gender')}:
                </div>
                <div className={infoValueClassname}>
                  {firstUppercase(currentUserInfo?.userGender ? t(currentUserInfo.userGender) : t('Unknown'))}
                </div>
              </div>
            ),
          },
          {
            id: '3',
            element: (
              <div className="w-full flex flex-col items-start justify-between border-b py-1.5 gap-0.5">
                <div className={infoLabelClassname}>
                  <AtSign size={infoIconSize} />
                  {t('Email')}:
                </div>
                <div className={infoValueClassname}>{currentUserInfo?.email || t('Unknown')}</div>
              </div>
            ),
          },
          {
            id: '4',
            element: (
              <div className="w-full flex flex-col items-start justify-between border-b py-1.5 gap-0.5">
                <div className={infoLabelClassname}>
                  <IdCard size={infoIconSize} />
                  {t('NIC')}:
                </div>
                <div className={infoValueClassname}>{currentUserInfo?.nic || t('Unknown')}</div>
              </div>
            ),
          },
          {
            id: '5',
            element: (
              <div className="w-full flex flex-col items-start justify-between border-b py-1.5 gap-0.5">
                <div className={infoLabelClassname}>
                  <MapIcon size={infoIconSize} />
                  {t('Address')}:
                </div>
                <div className={infoValueClassname}>{currentUserInfo?.address || t('Unknown')}</div>
              </div>
            ),
          },
          {
            id: '6',
            element: (
              <div className="w-full flex flex-col items-start justify-between pb-1.5 py-1.5 gap-0.5">
                <div className={infoLabelClassname}>
                  <MapPin size={infoIconSize} />
                  {t('City')}:
                </div>
                <div className={infoValueClassname}>
                  {currentUserInfo?.city ? currentUserInfo.city : t('Unknown')}
                </div>
              </div>
            ),
          },
        ],
      },
      {
        id: 'tags',
        label: t('Tags'),
        icon: <Tag size={iconSize} />,
        className: '',
        items: [
          {
            id: 'tag-selector',
            element: (
              <MultiSelect
                options={tagOptions}
                onValueChange={handleTagsChange}
                defaultValue={selectedTagsByChat[activeChat || ''] || []}
                placeholder={t('Select tags')}
                searchable={true}
                maxCount={3}
                variant="default"
                className="mb-2"
              />
            ),
          },
        ],
      },
      {
        id: 'activity',
        label: t('Recent Activity'),
        icon: <History size={iconSize} />,
        className: '',
        items: (() => {
          const sortedActivities = Object.entries(activities).sort(
            ([, a], [, b]) => a.timestamp - b.timestamp
          ); // Sort by timestamp, oldest first
          const totalActivities = sortedActivities.length;

          return sortedActivities.map(([activityID, activity], index) => ({
            id: activityID,
            element: (
              <div
                className={cn(
                  'py-2 text-xs max-w-full overflow-hidden',
                  index < totalActivities - 1 && 'border-b border-gray-200'
                )}
              >
                <div className="flex items-start gap-2 w-full">
                  <span className="text-gray-800 whitespace-pre-wrap break-words word-break-break-all flex-1 min-w-0">
                    {activity.activity}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1 break-words word-break-break-all">
                  {formatTimestamp(activity.timestamp)} •{' '}
                  {new Date(activity.timestamp).toLocaleDateString(locale, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              </div>
            ),
          }));
        })(),
      },
      {
        id: 'notes',
        label: t('Notes'),
        icon: <NotepadText size={iconSize} />,
        className: '',
        items: Object.entries(notes).map(([noteID, note]) => {
          const pictureUrl = noteProfilePictures.get(note.creator);
          // Notes are created by team members, not the chat user, so don't use chat user's gender
          const avatarConfig = generateAvatarConfig(note.creator);

          return {
            id: noteID,
            element: (
              <div className="relative cursor-default border border-yellow-300 flex items-start gap-2 p-2 bg-yellow-50 rounded-md mb-2">
                {/* Avatar */}
                <div className="shrink-0">
                  {pictureUrl ? (
                    <NextImage
                      src={pictureUrl}
                      alt={note.creator}
                      width={24}
                      height={24}
                      className="rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <Avatar {...avatarConfig} className="w-6 h-6" />
                  )}
                </div>

                {/* Note content */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-xs text-gray-800 break-words whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{
                      __html: formatWhatsapp(note.content || ''),
                    }}
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    {formatTimestamp(note.timestamp)} •{' '}
                    {new Date(note.timestamp).toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleDeleteClick(noteID)}
                  className="cursor-pointer absolute top-2 right-2 p-0.5 rounded hover:bg-red-100 hover:text-red-600 transition-colors"
                  title={t('Delete note')}
                >
                  <X size={14} />
                </button>
              </div>
            ),
          };
        }),
      },
      {
        id: 'media',
        label: t('Media'),
        icon: <ImageIcon size={iconSize} />,
        className: 'w-full flex flex-wrap gap-[1px]',
        items: mediaImages.map((media) => ({
          id: media.id,
          element: (
            <button
              type="button"
              className="mb-2 w-[calc(50%-3px)] aspect-square rounded-md border overflow-hidden cursor-pointer p-0 bg-transparent"
              onClick={() => onMessageClick?.(media.id)}
            >
              <NextImage
                className="w-full h-full object-cover"
                src={media.url}
                alt={t('Media')}
                width={0}
                height={0}
                sizes="100vw"
                unoptimized
              />
            </button>
          ),
        })),
      },
    ],
    [
      t,
      locale,
      mediaImages,
      onMessageClick,
      noteProfilePictures,
      currentUserInfo,
      notes,
      activities,
      tagOptions,
      selectedTagsByChat,
      activeChat,
      handleTagsChange,
    ]
  );

  // Hide panel if no active chat or on mobile (unless forceRender is true for modal)
  if (!activeChat || (isMobile && !forceRender)) {
    return null;
  }

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
    <div
      className={`${isMobile ? '' : 'border-t'} bg-white relative flex flex-col h-full w-full border-l border-gray-200 overflow-y-auto`}
    >
      {/* Slot: Top of right panel */}
      <Slot name="right-panel-top" />

      {/* Contact information section */}
      <div className={cn('p-4', isMobile && 'pt-0')}>
        <div className="flex flex-col gap-4">
          {/* AI Toggle */}
          {!isTestChat && onAIToggle && (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="ai-toggle-right"
                  className="text-sm font-medium m-0 cursor-pointer"
                >
                  {t('Bot active')}
                </Label>
              </div>
              <Switch
                className="cursor-pointer"
                id="ai-toggle-right"
                checked={isAIEnabled}
                onCheckedChange={onAIToggle}
              />
            </div>
          )}

          {currentUserInfo && (
            <UserCard userInfo={currentUserInfo} userID={activeChat} memberSince={memberSince} />
          )}

          {sections.map((section) => (
            <React.Fragment key={section.id}>
              <div className={cn(`mb-0`, cardClass)}>
                <button
                  className={`w-full flex justify-between items-center py-2 text-sm font-medium text-black ${
                    section.items ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => section.items && toggleSection(section.id)}
                >
                  <div className="flex items-center gap-2">
                    {section.icon}
                    <span className="text-xs font-semibold">{section.label}</span>
                  </div>

                  <div className="text-gray-400">
                    {expandedSections.has(section.id) ? (
                      <ChevronDown size={iconSize} />
                    ) : (
                      <ChevronRight size={iconSize} />
                    )}
                  </div>
                </button>

                {section.items && expandedSections.has(section.id) && (
                  <div className={cn('px-0 mt-0', section.className)}>
                    {section.items.map((item) => (
                      <React.Fragment key={item.id}>{item.element}</React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Slot: Content area for additional info */}
      <Slot name="right-panel-content" />

      {/* Spacer */}
      <div className="flex-grow"></div>

      {/* Slot: Bottom of right panel */}
      <Slot name="right-panel-bottom" />

      {/* Delete confirmation dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Delete Note')}</DialogTitle>
            <DialogDescription>
              {t('Are you sure you want to delete this note? This action cannot be undone·')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteNote}>
              {t('Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export const RightPanel = memo(RightPanelComponent);

RightPanel.displayName = 'RightPanel';
