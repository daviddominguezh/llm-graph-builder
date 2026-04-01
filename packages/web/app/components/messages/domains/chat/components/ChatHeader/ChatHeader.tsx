import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Avatar from 'react-nice-avatar';
import { useParams } from 'next/navigation';

import {
  AlertTriangle,
  ChevronLeft,
  CircleCheck,
  CircleEllipsis,
  CircleUserRound,
  Construction,
  EllipsisVertical,
  Instagram,
  Trash2,
} from 'lucide-react';

import { updateChatAssignee, updateChatStatus } from '@/app/components/messages/services/api';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/app/components/messages/shared/icons';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Menubar, MenubarContent, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

import { generateAvatarConfig } from '@/app/utils/avatar';
import { useIsMobile } from '@/app/utils/device';
import { parseChatId, ChatSource } from '@/app/utils/strs';

import { useAppDispatch } from '@/app/components/messages/store/mainStore';

import { updateAssigneeOptimistic, updateStatusOptimistic } from '@/app/components/messages/store';

import { TEST_PHONE } from '@/app/constants/messages';

import { LastMessage } from '@/app/types/chat';
import { Collaborator } from '@/app/types/projectInnerSettings';

/**
 * ChatHeader component displays conversation header with controls
 * Shows name, assigned user, status, and action menu
 */

interface ChatHeaderProps {
  chat: LastMessage | null;
  chatId: string; // Phone number with whatsapp: prefix (e.g., whatsapp:+573013189707)
  isTestChat?: boolean;
  onBack?: () => void;
  onDelete?: () => void;
  showBackButton?: boolean;
  className?: string;
  onContactClick?: () => void;
  collaborators?: Collaborator[];
  profilePictures?: Map<string, string>;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  chat,
  chatId,
  isTestChat = false,
  onBack,
  onDelete,
  showBackButton = false,
  className = '',
  onContactClick,
  collaborators = [],
  profilePictures = new Map(),
}) => {
  const t = useTranslations('messages');
  const params = useParams();
  const projectName = typeof params.projectName === 'string' ? params.projectName : (params.projectName?.[0] ?? 'nike');
  const isMobile = useIsMobile();
  const dispatch = useAppDispatch();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isAssignedModalOpen, setIsAssignedModalOpen] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [pendingAssignedTo, setPendingAssignedTo] = useState<string>('');
  const [status, setStatus] = useState<string>('open');
  const [pendingStatus, setPendingStatus] = useState<string>('');

  const HEADER_ICON_SIZE = isMobile ? 25 : 20;
  const HEADER_ICON_CLASSNAME = isMobile
    ? '[&_svg]:w-[25px]! [&_svg]:h-[25px]!'
    : '[&_svg]:w-[20px]! [&_svg]:h-[20px]!';
  // Icon size + padding (6px * 2)
  const HEADER_ICON_CONTAINER_SIZE = HEADER_ICON_SIZE + 12;

  // Parse chat ID to get source and display name
  const parsedChat = parseChatId(chatId || '');

  const displayName = (() => {
    if (isTestChat || chatId === TEST_PHONE) return 'Test Chat';
    const baseName = chat?.name || parsedChat.displayName;
    // For Instagram, prepend @ to the name and make lowercase
    return parsedChat.source === 'instagram' ? `@${baseName.toLowerCase()}` : baseName;
  })();

  // Render platform badge icon
  const renderPlatformBadge = (source: ChatSource) => {
    if (source === 'whatsapp') {
      return (
        <div className="absolute bottom-[-2px] right-[-2px] bg-white rounded-full w-[16px] h-[16px] flex items-center justify-center border border-gray-200 shadow-sm">
          <WhatsAppIcon size={10} className="text-[#25D366]" />
        </div>
      );
    }
    if (source === 'instagram') {
      return (
        <div className="absolute bottom-[-2px] right-[-2px] bg-white rounded-full w-[16px] h-[16px] flex items-center justify-center border border-gray-200 shadow-sm">
          <Instagram size={10} className="text-[#E4405F]" />
        </div>
      );
    }
    return null;
  };

  // Generate avatar config for the chat user
  const avatarConfig = generateAvatarConfig(chatId);

  // Initialize assignedTo from chat's assignees (find the one with highest timestamp)
  useEffect(() => {
    if (chat?.assignees) {
      const assigneeEntries = Object.values(chat.assignees);
      if (assigneeEntries.length > 0) {
        // Find assignee with highest timestamp
        const latestAssignee = assigneeEntries.reduce((latest, current) => {
          return current.timestamp > latest.timestamp ? current : latest;
        });
        setAssignedTo(latestAssignee.assignee);
      } else {
        setAssignedTo('');
      }
    } else {
      setAssignedTo('');
    }
  }, [chat?.assignees]);

  // Initialize status from chat's statuses (find the one with highest timestamp)
  useEffect(() => {
    if (chat?.statuses) {
      const statusEntries = Object.values(chat.statuses);
      if (statusEntries.length > 0) {
        // Find status with highest timestamp
        const latestStatus = statusEntries.reduce((latest, current) => {
          return current.timestamp > latest.timestamp ? current : latest;
        });
        setStatus(latestStatus.status);
      } else {
        setStatus('open');
      }
    } else {
      setStatus('open');
    }
  }, [chat?.statuses]);

  const handleDeleteClick = () => {
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    setIsDeleteModalOpen(false);
    onDelete?.();
  };

  const handleAssignedToChange = (value: string) => {
    setPendingAssignedTo(value);
    setIsAssignedModalOpen(true);
  };

  const handleConfirmAssignedChange = async () => {
    if (!projectName) return;

    // Optimistically update the local state immediately
    const assigneeValue = pendingAssignedTo === 'unassigned' ? 'none' : pendingAssignedTo;
    dispatch(updateAssigneeOptimistic({ chatId, assignee: assigneeValue }));
    setAssignedTo(pendingAssignedTo);
    setIsAssignedModalOpen(false);

    // Call API to update assignee (send "none" if unassigned)
    const success = await updateChatAssignee(projectName, chatId, assigneeValue);

    if (!success) {
      console.error('Failed to update assignee');
    }
  };

  const handleStatusChange = (value: string) => {
    setPendingStatus(value);
    setIsStatusModalOpen(true);
  };

  const handleConfirmStatusChange = async () => {
    if (!projectName) return;

    // Optimistically update the local state immediately
    dispatch(updateStatusOptimistic({ chatId, status: pendingStatus }));
    setStatus(pendingStatus);
    setIsStatusModalOpen(false);

    // Call API to update status
    const success = await updateChatStatus(projectName, chatId, pendingStatus);

    if (!success) {
      console.error('Failed to update status');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'open':
        return <CircleEllipsis size={HEADER_ICON_SIZE} strokeWidth={2} className="text-foreground" />;
      case 'blocked':
        return <Construction size={HEADER_ICON_SIZE} strokeWidth={2} className="text-yellow-500" />;
      case 'closed':
        return <CircleCheck size={HEADER_ICON_SIZE} strokeWidth={2} className="text-green-700" />;
      case 'verify-payment':
        return <AlertTriangle size={HEADER_ICON_SIZE} strokeWidth={2} className="text-amber-500" />;
      default:
        return <CircleEllipsis size={HEADER_ICON_SIZE} strokeWidth={2} className="text-foreground" />;
    }
  };

  const getAssignedToDisplay = () => {
    if (!assignedTo || assignedTo === 'unassigned') {
      return <CircleUserRound size={HEADER_ICON_SIZE} strokeWidth={2} className="text-foreground" />;
    }

    const assignedCollaborator = collaborators.find((c) => c.email === assignedTo);
    if (!assignedCollaborator) {
      return <CircleUserRound size={HEADER_ICON_SIZE} strokeWidth={2} className="text-foreground" />;
    }

    const pictureUrl = profilePictures.get(assignedTo);
    const avatarConfig = generateAvatarConfig(assignedTo);

    if (pictureUrl) {
      return (
        <Image
          src={pictureUrl}
          alt={assignedCollaborator.name}
          width={HEADER_ICON_SIZE}
          height={HEADER_ICON_SIZE}
          className="rounded-full object-cover"
          unoptimized
        />
      );
    }

    return (
      <Avatar
        {...avatarConfig}
        style={{
          width: `${HEADER_ICON_SIZE}px`,
          height: `${HEADER_ICON_SIZE}px`,
          minWidth: `${HEADER_ICON_SIZE}px`,
        }}
        className="rounded-full"
      />
    );
  };

  return (
    <div
      className={`h-[41px] border-l w-full bg-background px-3 flex items-center gap-3 z-10 ${className}`}
    >
      {/* Back button (mobile) */}
      {showBackButton && onBack && (
        <div
          className="cursor-pointer flex items-center justify-center p-1 px-0 rounded"
          onClick={onBack}
        >
          <ChevronLeft size={24} />
        </div>
      )}

      {/* Name and status - clickable on mobile to open RightPanel */}
      <div
        className={`flex items-center gap-3 flex-1 min-w-0 ${
          isMobile && onContactClick
            ? 'cursor-pointer rounded p-1 -ml-1 transition-colors hover:bg-gray-50 active:bg-gray-100'
            : ''
        }`}
        onClick={isMobile && onContactClick ? onContactClick : undefined}
      >
        {/* Avatar */}
        <div className="shrink-0 relative">
          <Avatar
            {...avatarConfig}
            style={{ width: '25px', height: '25px', minWidth: '25px' }}
            className="rounded-full"
          />
          {!isTestChat && chatId !== TEST_PHONE && renderPlatformBadge(parsedChat.source)}
        </div>

        {/* Name and status */}
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-semibold m-0 flex items-center gap-2">
            <span className="cursor-default overflow-hidden text-ellipsis whitespace-nowrap">
              {displayName}
            </span>
            {chat?.status === 'boss' && (
              <Badge variant="destructive" className="shrink-0">
                {t('Inquiry')}
              </Badge>
            )}
          </h3>
        </div>
      </div>

      {/* Assigned To Select */}
      <div className="flex shrink-0 items-center">
        <Select value={assignedTo} onValueChange={(value) => value && handleAssignedToChange(value)}>
          <SelectTrigger
            style={{
              width: `${HEADER_ICON_CONTAINER_SIZE}px`,
              height: `${HEADER_ICON_CONTAINER_SIZE}px`,
              padding: '6px',
            }}
            className={`cursor-pointer border-0 shadow-none bg-transparent rounded [&_svg[class*=chevron]]:hidden ${HEADER_ICON_CLASSNAME}`}
          >
            <div
              style={{
                width: `${HEADER_ICON_SIZE}px`,
                height: `${HEADER_ICON_SIZE}px`,
              }}
              className={`flex items-center justify-center shrink-0 text-foreground ${HEADER_ICON_CLASSNAME}`}
            >
              {getAssignedToDisplay()}
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem className="cursor-pointer" value="unassigned">
              {t('Unassigned')}
            </SelectItem>
            {collaborators.map((collaborator) => {
              const pictureUrl = profilePictures.get(collaborator.email);
              const avatarConfig = generateAvatarConfig(collaborator.email);

              return (
                <SelectItem className="cursor-pointer" key={collaborator.email} value={collaborator.email}>
                  <div className="flex items-center gap-2">
                    {pictureUrl ? (
                      <Image
                        src={pictureUrl}
                        alt={collaborator.name}
                        width={HEADER_ICON_SIZE}
                        height={HEADER_ICON_SIZE}
                        className="rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <Avatar
                        {...avatarConfig}
                        style={{
                          width: `${HEADER_ICON_SIZE}px`,
                          height: `${HEADER_ICON_SIZE}px`,
                          minWidth: `${HEADER_ICON_SIZE}px`,
                        }}
                        className="rounded-full"
                      />
                    )}
                    <span>{collaborator.name}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Status Select */}
      <div className="flex shrink-0 items-center">
        <Select value={status} onValueChange={(value) => value && handleStatusChange(value)}>
          <SelectTrigger
            style={{
              width: `${HEADER_ICON_CONTAINER_SIZE}px`,
              height: `${HEADER_ICON_CONTAINER_SIZE}px`,
              padding: '6px',
            }}
            className="cursor-pointer border-0 shadow-none bg-transparent rounded [&_svg[class*=chevron]]:hidden"
          >
            <div
              style={{
                width: `${HEADER_ICON_SIZE}px`,
                height: `${HEADER_ICON_SIZE}px`,
              }}
              className="flex items-center justify-center shrink-0 [&_svg]:w-full! [&_svg]:h-full!"
            >
              {getStatusIcon()}
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem className="cursor-pointer" value="open">
              {t('chat-status-open')}
            </SelectItem>
            <SelectItem className="cursor-pointer" value="closed">
              {t('chat-status-closed')}
            </SelectItem>
            <SelectItem className="cursor-pointer" value="blocked">
              {t('chat-status-blocked')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Actions menu */}
      <Menubar className="w-[37px] h-[37px] p-0! m-0! shrink-0 flex border-0 shadow-none bg-transparent px-0">
        <MenubarMenu>
          <MenubarTrigger className="p-0 px-0 w-[37px] h-[37px] flex items-center justify-center bg-transparent cursor-pointer">
            <div
              style={{ width: `${HEADER_ICON_SIZE}px`, height: `${HEADER_ICON_SIZE}px` }}
              className="cursor-pointer flex items-center justify-center"
            >
              <EllipsisVertical size={HEADER_ICON_SIZE} />
            </div>
          </MenubarTrigger>
          <MenubarContent>
            <Command>
              <CommandList>
                {onDelete && (
                  <CommandItem onSelect={handleDeleteClick} className="cursor-pointer">
                    <Trash2 className="text-[#ef4444]" />
                    <span className="text-[#ef4444]">{t('Delete chat')}</span>
                  </CommandItem>
                )}
              </CommandList>
            </Command>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      {/* Delete confirmation modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Delete chat')}</DialogTitle>
            <DialogDescription>
              {t('Are you sure you want to delete this chat? This action cannot be undone·')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">{t('Cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              {t('Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status change confirmation modal */}
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Confirm Status Change')}</DialogTitle>
            <DialogDescription>{t('Are you sure you want to change the chat status?')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">{t('Cancel')}</Button>
            </DialogClose>
            <Button onClick={handleConfirmStatusChange}>{t('Confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assigned change confirmation modal */}
      <Dialog open={isAssignedModalOpen} onOpenChange={setIsAssignedModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Confirm Assignment Change')}</DialogTitle>
            <DialogDescription>{t('Are you sure you want to change the assigned agent?')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">{t('Cancel')}</Button>
            </DialogClose>
            <Button onClick={handleConfirmAssignedChange}>{t('Confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

ChatHeader.displayName = 'ChatHeader';
