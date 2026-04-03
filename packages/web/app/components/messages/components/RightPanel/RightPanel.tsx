import { deleteNote, getNotes, getUserPictureByEmailCached } from '@/app/components/messages/services/api';
import type { Conversation } from '@/app/types/chat';
import { generateAvatarConfig } from '@/app/utils/avatar';
import { useIsMobile } from '@/app/utils/device';
import { formatTimestamp, formatWhatsapp } from '@/app/utils/strs';
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
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Image as ImageIcon, NotepadText, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import NextImage from 'next/image';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from 'react-nice-avatar';

import { useChat, useTenantId } from '../../core/contexts';
import { Slot } from '../../core/slots';

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
  const projectName = useTenantId();
  const isMobile = useIsMobile();
  const { notes, setNotes, notesRefreshTrigger, triggerNotesRefresh } = useChat();

  // Ref to track the current active chat (to prevent race conditions)
  const activeChatRef = useRef<string | null>(activeChat);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['info', 'notes', 'activity', 'media'])
  );

  // State for note creator profile pictures
  const [noteProfilePictures, setNoteProfilePictures] = useState<Map<string, string>>(new Map());

  // State for delete confirmation dialog
  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Update ref whenever activeChat changes
  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

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

        return;
      }

      // Capture the current chat ID at the time of the effect
      const chatIdAtFetchTime = activeChat;

      // Fetch all data in parallel
      await Promise.all([fetchNotesData(projectName, chatIdAtFetchTime)]);
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

    run();
  }, [activeChat, projectName, notesRefreshTrigger, setNotes]);

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

  const cardClass =
    'cursor-default relative w-full border p-3 py-1 rounded-lg bg-background shadow-lg overflow-hidden';

  const sections: Section[] = useMemo(
    () => [
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
    [t, locale, mediaImages, onMessageClick, noteProfilePictures, notes]
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
      className={`${isMobile ? '' : 'border-t'} bg-background relative flex flex-col h-full w-full border-l border-border overflow-y-auto`}
    >
      {/* Slot: Top of right panel */}
      <Slot name="right-panel-top" />

      {/* Contact information section */}
      <div className={cn('p-2', isMobile && 'pt-0')}>
        <div className="flex flex-col gap-4">
          {/* AI Toggle */}
          {!isTestChat && onAIToggle && (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-background shadow-sm">
              <div className="flex items-center gap-2">
                <Label htmlFor="ai-toggle-right" className="text-sm font-medium m-0 cursor-pointer">
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

          {sections.map((section) => (
            <React.Fragment key={section.id}>
              <div className={cn(`mb-0`, cardClass)}>
                <button
                  className={`w-full flex justify-between items-center py-2 text-sm font-medium text-foreground ${
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
