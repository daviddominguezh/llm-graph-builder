
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'next/navigation';

import { v4 as uuidv4 } from 'uuid';

import { createNote } from '@/app/components/messages/services/api';
import { getCurrentFirebaseUser, uploadFile } from '@/app/components/messages/services/firebase';

import { playSoundMessageSent } from '@/app/components/messages/shared/utilStubs';
import { getMediaKind } from '@/app/components/messages/shared/utilStubs';

import { setLastMessage } from '@/app/components/messages/store';
import { getLastMessagesFromStore } from '@/app/components/messages/store';

import { AI_MESSAGE_ROLES, INTENT } from '@/app/types/chat';
import type { LastMessage, Message } from '@/app/types/chat';
import type { MediaFileDetail, MediaFileDetailList } from '@/app/types/media';
import { MediaStatus } from '@/app/types/media';

import { BUSINESS_MESSAGES_GROUP_NAME, IMAGE_FILE_EXTENSIONS } from '@/app/constants/media';

import type { PendingImageAttachment } from '../../domains/message/components/MessageInput/types';
import { useMessageRepository } from '../../hooks/useMessageRepository';
import { useAI } from './AIContext';
import { useChat } from './ChatContext';

interface MessageContextValue {
  // State
  inputMessage: string;
  highlightedMessageId: string | null;
  isSendingTestMessage: boolean;
  pendingImageAttachment: PendingImageAttachment | null;

  // Actions
  setInputMessage: (value: string) => void;
  handleSendMessage: (content: string, mode: 'reply' | 'note') => Promise<void>;
  handleSendMessageUIOnly: (content: string, messageId: string) => void;
  handleMediaUpload: (files: MediaFileDetailList) => Promise<void>;
  handleImageFilePicked: (file: File, fileName: string, fileId: string) => void;
  highlightMessage: (messageId: string | null) => void;
  replyToMessage: (messageId: string) => void;
  stopTestMessageTyping: () => void;
  clearPendingImageAttachment: () => void;
}

const MessageContext = createContext<MessageContextValue>({} as MessageContextValue);

export const MessageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const params = useParams();
  const projectName = typeof params.projectName === 'string' ? params.projectName : (params.projectName?.[0] ?? 'nike');
  const dispatch = useDispatch();
  const repository = useMessageRepository();
  const { activeChat, isTestChatActive, messages, currentChat, addMessage, triggerNotesRefresh, updateCachedConversation } = useChat();
  const { isAIEnabled, setIsAIEnabled } = useAI();
  const lastMessages = useSelector(getLastMessagesFromStore);

  // Store input messages per chat ID
  const [inputMessages, setInputMessages] = useState<Record<string, string>>({});
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [isSendingTestMessage, setIsSendingTestMessage] = useState(false);

  // Store pending image attachments per chat ID (image uploads deferred until send)
  const [pendingImageAttachments, setPendingImageAttachments] = useState<Record<string, PendingImageAttachment>>({});

  // Track last processed files to prevent duplicate sends
  const lastProcessedFilesRef = useRef<string>('');

  // Derive current input message from the per-chat map
  const inputMessage = useMemo(() => {
    return activeChat ? (inputMessages[activeChat] || '') : '';
  }, [activeChat, inputMessages]);

  // Derive current pending image attachment from the per-chat map
  const pendingImageAttachment = useMemo(() => {
    return activeChat ? (pendingImageAttachments[activeChat] || null) : null;
  }, [activeChat, pendingImageAttachments]);

  // Update input message handler to save per chat
  const setInputMessage = useCallback(
    (value: string) => {
      if (activeChat) {
        setInputMessages((prev) => ({
          ...prev,
          [activeChat]: value,
        }));
      }
    },
    [activeChat]
  );

  // Set or clear pending image attachment for the active chat
  const setPendingImageAttachment = useCallback(
    (attachment: PendingImageAttachment | null) => {
      if (!activeChat) return;
      setPendingImageAttachments((prev) => {
        if (attachment === null) {
          return Object.fromEntries(
            Object.entries(prev).filter(([key]) => key !== activeChat)
          );
        }
        return { ...prev, [activeChat]: attachment };
      });
    },
    [activeChat]
  );

  const clearPendingImageAttachment = useCallback(() => {
    if (activeChat) {
      const current = pendingImageAttachments[activeChat];
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
    }
    setPendingImageAttachment(null);
  }, [activeChat, pendingImageAttachments, setPendingImageAttachment]);

  // Handle a raw image file picked by the user (creates blob URL for preview, defers upload)
  const handleImageFilePicked = useCallback(
    (file: File, fileName: string, fileId: string) => {
      const previewUrl = URL.createObjectURL(file);
      setPendingImageAttachment({
        id: fileId,
        file,
        fileName,
        previewUrl,
      });
    },
    [setPendingImageAttachment]
  );

  // Handle sending regular or test messages with full optimistic update logic
  // Also handles sending pending image attachments alongside optional text
  const handleSendMessage = useCallback(
    async (msg: string, mode: 'reply' | 'note' = 'reply') => {
      if (!activeChat || (!currentChat && !isTestChatActive)) return;
      const trimmedMsg = msg.trim();

      // Get pending image only in reply mode (notes are text-only)
      const currentPendingImage = mode === 'reply'
        ? (pendingImageAttachments[activeChat] || null)
        : null;

      // Nothing to send if no text and no pending image
      if (!trimmedMsg && !currentPendingImage) return;

      // Clear input immediately (before async send) for this specific chat
      setInputMessages((prev) => ({ ...prev, [activeChat]: '' }));

      // Clear pending image immediately if we're sending it
      if (currentPendingImage) {
        setPendingImageAttachments((prev) =>
          Object.fromEntries(
            Object.entries(prev).filter(([key]) => key !== activeChat)
          )
        );
      }

      // If mode is 'note', create a note instead of sending a message
      if (mode === 'note') {
        if (!trimmedMsg) return;
        const firebaseUser = await getCurrentFirebaseUser();
        const userEmail = firebaseUser?.email;

        if (!userEmail) {
          console.error('Cannot create note: user email not found');
          return;
        }

        try {
          await createNote(projectName || '', activeChat, trimmedMsg, userEmail);
          playSoundMessageSent();
          triggerNotesRefresh();
        } catch (error) {
          console.error('Failed to create note:', error);
        }
        return;
      }

      // Turn off AI when user sends message (skip for test chat)
      if (isAIEnabled && !isTestChatActive) {
        repository.setChatbotActiveState(projectName || '', activeChat, false);
        const lastMsg = lastMessages?.[activeChat];
        if (lastMsg) {
          dispatch(
            setLastMessage({
              id: activeChat,
              lastMessage: { ...lastMsg, enabled: false },
              preventFetch: true,
            })
          );
        }
        setIsAIEnabled(false);
      }

      playSoundMessageSent();
      const messageRole = isTestChatActive ? AI_MESSAGE_ROLES.USER : AI_MESSAGE_ROLES.ASSISTANT;
      const now = Date.now();

      // Capture values for async callbacks to prevent stale closures
      const capturedProject = projectName || '';
      const capturedChat = activeChat;
      const capturedIsTest = isTestChatActive;

      // Send pending image (if any) as a single message with optional caption
      if (currentPendingImage) {
        // Show optimistic image message immediately (blob URL for local preview)
        const imgMsgObj: Message = {
          id: currentPendingImage.id,
          type: 'image',
          intent: INTENT.NONE,
          originalId: '',
          timestamp: now,
          mediaUrl: currentPendingImage.previewUrl,
          message: { content: trimmedMsg, role: messageRole },
        };
        addMessage(imgMsgObj);

        if (currentChat) {
          const lastMsgObj: LastMessage = {
            ...currentChat,
            id: currentPendingImage.id,
            message: imgMsgObj.message,
            read: true,
            timestamp: now,
          };
          dispatch(setLastMessage({ id: activeChat, lastMessage: lastMsgObj, preventFetch: true }));
          updateCachedConversation(activeChat, lastMsgObj);
        }

        // Upload to Firebase in background, then send to backend with caption
        const groupName = `${BUSINESS_MESSAGES_GROUP_NAME}/${capturedChat}`;
        const mediaFileDetail: MediaFileDetail = {
          id: currentPendingImage.id,
          name: currentPendingImage.fileName,
          link: '',
          kind: getMediaKind(currentPendingImage.fileName),
          status: MediaStatus.UPLOADING,
          file: currentPendingImage.file,
        };
        const capturedImgId = currentPendingImage.id;
        const capturedCaption = trimmedMsg || undefined;

        uploadFile(groupName, capturedProject, capturedImgId, mediaFileDetail, () => {})
          .then((uploadedFile) => {
            repository.sendMediaMessage(
              capturedProject, capturedChat, uploadedFile.link,
              'image', capturedImgId, capturedIsTest, capturedCaption
            );
          });

        // Show typing indicator for test chat
        if (capturedIsTest) {
          setIsSendingTestMessage(true);
        }
      } else if (trimmedMsg) {
        // Text-only send (no pending image)
        const id = uuidv4();

        const msgObj: Message = {
          id,
          type: 'text',
          intent: INTENT.NONE,
          originalId: '',
          timestamp: now,
          message: { content: trimmedMsg, role: messageRole },
        };
        addMessage(msgObj);

        if (currentChat) {
          const lastMsgObj: LastMessage = {
            ...currentChat,
            id,
            message: msgObj.message,
            read: true,
            timestamp: now,
          };
          dispatch(setLastMessage({ id: activeChat, lastMessage: lastMsgObj, preventFetch: true }));
          updateCachedConversation(activeChat, lastMsgObj);
        }

        if (isTestChatActive) {
          setIsSendingTestMessage(true);
        }
        repository.sendMessage(capturedProject, capturedChat, trimmedMsg, 'text', id, capturedIsTest);
      }
    },
    [
      projectName,
      activeChat,
      currentChat,
      isTestChatActive,
      isAIEnabled,
      lastMessages,
      dispatch,
      setIsAIEnabled,
      addMessage,
      repository,
      updateCachedConversation,
      pendingImageAttachments,
      triggerNotesRefresh,
    ]
  );

  // Handle sending message UI update only (no backend call)
  // Used when backend send needs to be delayed separately
  const handleSendMessageUIOnly = useCallback(
    (msg: string, messageId: string) => {
      if (!activeChat || (!currentChat && !isTestChatActive)) return;
      const trimmedMsg = msg.trim();
      if (!trimmedMsg) return;

      playSoundMessageSent();

      // Add message to UI immediately (optimistic update)
      const msgObj: Message = {
        id: messageId,
        type: 'text',
        intent: INTENT.NONE,
        originalId: '',
        timestamp: Date.now(),
        message: {
          content: trimmedMsg,
          // In TEST chat: User simulates CUSTOMER (user role, right side) to test assistant
          // In REGULAR chat: Business responds as ASSISTANT (assistant role, left side)
          role: isTestChatActive ? AI_MESSAGE_ROLES.USER : AI_MESSAGE_ROLES.ASSISTANT,
        },
      };

      addMessage(msgObj);

      // Update last message in sidebar
      if (currentChat) {
        const lastMsgObj: LastMessage = {
          ...currentChat,
          id: messageId,
          message: msgObj.message,
          read: true,
          timestamp: Date.now(),
        };
        dispatch(setLastMessage({ id: activeChat, lastMessage: lastMsgObj, preventFetch: true }));
        // Also persist to IndexedDB cache
        updateCachedConversation(activeChat, lastMsgObj);
      }
    },
    [activeChat, currentChat, isTestChatActive, addMessage, dispatch, updateCachedConversation]
  );

  // Handle media upload with full logic from useMessageSending
  // Images from the file picker are intercepted earlier (in WithFirebaseUploader's onImageFilePicked)
  // This function handles already-uploaded files (non-images and product card images)
  const handleMediaUpload = useCallback(
    async (files: MediaFileDetailList) => {
      if (!activeChat || (!currentChat && !isTestChatActive)) return;

      const filesList = Object.values(files);
      if (filesList.length === 0) return;

      // Generate fingerprint of files to detect duplicates
      const filesFingerprint = filesList
        .map((f) => `${f.link}:${f.name}`)
        .sort()
        .join('|');

      if (lastProcessedFilesRef.current === filesFingerprint) {
        return; // Duplicate call, skip
      }

      lastProcessedFilesRef.current = filesFingerprint;

      let hasNonImageFiles = false;

      for (const file of filesList) {
        const mediaId = uuidv4();
        const mediaUrl = file.link || '';
        const kindLower = file.kind.toLowerCase();
        const fileNameLower = file.name.toLowerCase();
        const isVoiceNote =
          fileNameLower.startsWith('voice-note-') && fileNameLower.endsWith('.m4a');

        // Determine API media type
        const isImageType = kindLower.startsWith('image') ||
          IMAGE_FILE_EXTENSIONS.includes(kindLower as typeof IMAGE_FILE_EXTENSIONS[number]);

        const apiMediaType: 'image' | 'audio' | 'pdf' | 'video' =
          isImageType
            ? 'image'
            : kindLower.startsWith('pdf') || kindLower === 'pdf' || kindLower === 'application/pdf'
              ? 'pdf'
              : kindLower.startsWith('audio') || kindLower === 'm4a' || kindLower === 'mp3' ||
                  kindLower === 'ogg' || isVoiceNote
                ? 'audio'
                : kindLower.startsWith('video') || ['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(kindLower)
                  ? 'video'
                  : 'audio';

        // Send all files immediately (images from file picker are intercepted earlier)
        hasNonImageFiles = true;
        const messageType: 'image' | 'audio' | 'pdf' | 'video' | 'document' | 'text' =
          apiMediaType === 'pdf' ? 'document' : apiMediaType;

        repository.sendMediaMessage(
          projectName || '', activeChat, mediaUrl, apiMediaType, mediaId, isTestChatActive
        );

        const msgObj: Message = {
          id: mediaId,
          type: messageType === 'video' ? 'text' : messageType,
          intent: INTENT.NONE,
          originalId: '',
          timestamp: Date.now(),
          mediaUrl,
          message: {
            content: '',
            role: isTestChatActive ? AI_MESSAGE_ROLES.USER : AI_MESSAGE_ROLES.ASSISTANT,
          },
        };

        addMessage(msgObj);

        if (currentChat) {
          const lastMsgObj: LastMessage = {
            ...currentChat,
            id: mediaId,
            message: msgObj.message,
            read: true,
            timestamp: Date.now(),
          };
          dispatch(setLastMessage({ id: activeChat, lastMessage: lastMsgObj, preventFetch: true }));
          updateCachedConversation(activeChat, lastMsgObj);
        }
      }

      // Only disable AI and play sound for non-image files that were sent immediately
      if (hasNonImageFiles) {
        if (isAIEnabled && !isTestChatActive) {
          repository.setChatbotActiveState(projectName || '', activeChat, false);
          const lastMsg = lastMessages?.[activeChat];
          if (lastMsg) {
            dispatch(
              setLastMessage({
                id: activeChat,
                lastMessage: { ...lastMsg, enabled: false },
                preventFetch: true,
              })
            );
          }
          setIsAIEnabled(false);
        }
        playSoundMessageSent();
      }

      // Reset fingerprint after a delay to allow new uploads
      setTimeout(() => {
        lastProcessedFilesRef.current = '';
      }, 1000);
    },
    [
      projectName,
      activeChat,
      currentChat,
      isTestChatActive,
      isAIEnabled,
      lastMessages,
      dispatch,
      setIsAIEnabled,
      addMessage,
      repository,
      updateCachedConversation,
    ]
  );

  const highlightMessage = useCallback((messageId: string | null) => {
    setHighlightedMessageId(messageId);

    // Auto-clear highlight after 2 seconds
    if (messageId) {
      setTimeout(() => {
        setHighlightedMessageId(null);
      }, 2000);
    }
  }, []);

  const replyToMessage = useCallback(
    (messageId: string) => {
      const message = messages[messageId];
      if (!message) return;

      // Scroll to message and highlight it
      highlightMessage(messageId);

      // Focus input (will be handled by UI components listening to this event)
    },
    [messages, highlightMessage]
  );

  // Stop the typing indicator for test chat
  // Called when we receive an AI response via websocket (text message only)
  const stopTestMessageTyping = useCallback(() => {
    setIsSendingTestMessage(false);
  }, []);

  const value: MessageContextValue = {
    inputMessage,
    highlightedMessageId,
    isSendingTestMessage,
    pendingImageAttachment,
    setInputMessage,
    handleSendMessage,
    handleSendMessageUIOnly,
    handleMediaUpload,
    handleImageFilePicked,
    highlightMessage,
    replyToMessage,
    stopTestMessageTyping,
    clearPendingImageAttachment,
  };

  return <MessageContext.Provider value={value}>{children}</MessageContext.Provider>;
};

export const useMessage = () => {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessage must be used within MessageProvider');
  }
  return context;
};
