import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSelector } from 'react-redux';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { useParams } from 'next/navigation';

import { v4 as uuidv4 } from 'uuid';

import {
  getProjectCollaborators,
  getQuickReplies,
  getTags,
  getUserPictureByEmailCached,
} from '@/app/components/messages/services/api';
import { getCurrentFirebaseUser, uploadFile } from '@/app/components/messages/services/firebase';

import { MediaFileDetail, MediaFileKind, MediaStatus } from '@/app/types/media';

import WithFirebaseUploader from '@/app/components/messages/hocs/withFirebaseUploader';

import { combineAllTags } from '@/app/components/messages/chatSettings/tagsUtils';

import FilePicker from '@/app/components/messages/shared/filePicker';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { useRBAC } from '@/app/components/messages/hooks/useRBAC';

import { useIsMobile } from '@/app/utils/device';

import { getFetchQueue, getRealtimeMessages } from '@/app/components/messages/store';

import { COLLABORATOR_ROLE } from '@/app/types/projectInnerSettings';

import { BUSINESS_MESSAGES_GROUP_NAME, MEDIA_SUPPORTED_TYPES, INSTAGRAM_MEDIA_SUPPORTED_TYPES } from '@/app/constants/media';

import { Collaborator } from '@/app/types/projectInnerSettings';

import { TEST_PHONE } from '@/app/constants/messages';

import { useAI, useChat, useMessage, useUI } from '../../core/contexts';
import { createMessageQueueService } from '../../core/services';
import { ChatEmptyState } from '../../domains/chat/components/ChatEmptyState';
import { ChatHeader } from '../../domains/chat/components/ChatHeader';
import { useMessageRepository } from '../../hooks/useMessageRepository';
import nodesList from '../../nodesList.json';
import { ChatListPanel } from '../ChatListPanel';
import { ChatViewPanel } from '../ChatViewPanel';
import { LeftPanel } from '../LeftPanel/LeftPanel';
import { RightPanel } from '../RightPanel/RightPanel';

interface MessagesDashboardLayoutProps {
  onChangeSidebar: (val: boolean) => void;
  initialChatFilter?: string;
}

/**
 * MessagesDashboardLayout
 *
 * Main layout component for the messages dashboard.
 * Uses context-based architecture for clean separation of concerns.
 *
 * Architecture: All business logic is in contexts and services, this component only handles:
 * - Rendering layout structure
 * - Mobile sidebar management (presentational concern)
 * - Fetch queue orchestration (delegates to MessageQueueService)
 */
export const MessagesDashboardLayout: React.FC<MessagesDashboardLayoutProps> = ({ onChangeSidebar, initialChatFilter }) => {
  const params = useParams();
  const projectName = typeof params.projectName === 'string' ? params.projectName : params.projectName?.[0] ?? '';
  const repository = useMessageRepository();

  const t = useTranslations('messages');
  const isMobile = useIsMobile();
  const { currentRole } = useRBAC();

  // Check if user is an agent (to hide filter dropdown since they have tabs)
  const isAgent = currentRole === COLLABORATOR_ROLE.AGENT;

  // Create queue service instance (memoized to prevent recreation)
  const queueService = useMemo(() => createMessageQueueService(), []);

  // Redux state (for fetch queue - will be moved to SyncContext)
  const fetchQueue = useSelector(getFetchQueue);
  const realtimeMessages = useSelector(getRealtimeMessages);

  // Use contexts instead of custom hooks
  const {
    activeChat,
    messages,
    currentChat,
    isTestChatActive,
    orderedChats,
    selectChat,
    deleteChat,
    addMessages,
    removeMessages,
    setAvailableTags,
    setAvailableQuickReplies,
    loadMoreConversations,
    hasMoreConversations,
    isLoadingMoreConversations,
    loadOlderMessages,
    hasMoreOlderMessages,
    isLoadingMessages,
    isLoadingOlderMessages,
  } = useChat();

  const {
    inputMessage,
    setInputMessage,
    handleSendMessage,
    handleMediaUpload,
    handleImageFilePicked,
    highlightedMessageId,
    replyToMessage,
    stopTestMessageTyping,
  } = useMessage();

  const {
    isSearchActive,
    filteredChatsPhone,
    filteredChatsName,
    messageMatches,
    performSearch,
    clearSearch,
    openModal,
    closeModal,
    isModalOpen,
  } = useUI();

  const {
    isAIEnabled,
    toggleAI,
    isNodeSelectionModalOpen,
    closeNodeSelectionModal,
    selectedNode,
    setSelectedNode,
    confirmNode,
    inquiryResponse,
    setInquiryResponse,
    isInquiryModalOpen,
    openInquiryModal,
    closeInquiryModal,
    inquiryLoading,
    resolveInquiry,
  } = useAI();

  // Chat filter state (shared between LeftPanel and ChatListPanel)
  const [chatFilter, setChatFilter] = useState<string>(initialChatFilter || 'inbox');

  // Sync chatFilter with initialChatFilter prop when it changes (e.g., when switching tabs)
  useEffect(() => {
    if (initialChatFilter) {
      setChatFilter(initialChatFilter);
    }
  }, [initialChatFilter]);

  // Track LeftPanel collapse state
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState<boolean>(false);

  // Track mobile right panel modal visibility
  const [mobileRightPanelOpen, setMobileRightPanelOpen] = useState<boolean>(false);

  // Collaborators data for teammate filter
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [profilePictures, setProfilePictures] = useState<Map<string, string>>(new Map());

  // Current user email for inbox filter
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  // Panel size calculations for resizable panels (desktop only)
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current && !isMobile) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [isMobile]);

  // Calculate panel sizes synchronously based on current state
  const panelSizes = useMemo(() => {
    if (isMobile || containerWidth === 0) {
      return {
        leftPanel: 17,
        leftPanelMin: 17,
        leftPanelMax: undefined,
        chatList: 29.2,
        chatView: 70.8,
        rightPanel: 29.2,
        rightPanelInChatView: (29.2 / 70.8) * 100,
      };
    }

    // Calculate LeftPanel size (200px target when expanded, 56px when collapsed)
    const targetLeftPanelWidth = leftPanelCollapsed ? 56 : 200;
    const leftPanelPercentage = (targetLeftPanelWidth / containerWidth) * 100;

    // Available width for remaining panels (ChatList, ChatView, RightPanel)
    const availableWidthForRemaining = containerWidth - targetLeftPanelWidth;

    if (availableWidthForRemaining <= 0) {
      return {
        leftPanel: leftPanelPercentage,
        leftPanelMin: leftPanelPercentage,
        leftPanelMax: undefined,
        chatList: 29.2,
        chatView: 70.8,
        rightPanel: 29.2,
        rightPanelInChatView: (29.2 / 70.8) * 100,
      };
    }

    // Calculate percentage for ChatList and RightPanel (280px each)
    const targetPanelWidth = 280;
    const chatPanelPercentage = (targetPanelWidth / availableWidthForRemaining) * 100;

    // When chat is active: chatList (280px) + chatView (remaining, contains both messages and rightPanel)
    // When no chat: chatList (280px) + chatView (remaining)
    const chatListSize = chatPanelPercentage;
    const rightPanelSize = chatPanelPercentage;
    // chat-view-panel now contains both messages and right panel, so always use full remaining space
    const chatViewSize = 100 - chatListSize;
    // Calculate right panel size as percentage of chat-view-panel (for nested ResizablePanelGroup)
    const rightPanelInChatView = (rightPanelSize / chatViewSize) * 100;

    // Calculate minimum size for LeftPanel (200px when expanded, same as default when collapsed)
    const leftPanelMinSize = leftPanelCollapsed ? leftPanelPercentage : (200 / containerWidth) * 100;
    // When collapsed, lock the panel by setting maxSize to same as minSize
    const leftPanelMaxSize = leftPanelCollapsed ? leftPanelPercentage : undefined;

    return {
      leftPanel: leftPanelPercentage,
      leftPanelMin: leftPanelMinSize,
      leftPanelMax: leftPanelMaxSize,
      chatList: chatListSize,
      chatView: chatViewSize,
      rightPanel: rightPanelSize,
      rightPanelInChatView: rightPanelInChatView,
    };
  }, [isMobile, containerWidth, activeChat, leftPanelCollapsed]);

  // Resize left panel when collapse state changes
  useEffect(() => {
    if (leftPanelRef.current && !isMobile) {
      leftPanelRef.current.resize(panelSizes.leftPanel);
    }
  }, [isMobile, leftPanelCollapsed, panelSizes.leftPanel]);

  // Hide mobile sidebar when chat is selected, show when deselected
  useEffect(() => {
    if (isMobile) {
      onChangeSidebar(!activeChat);
    }
  }, [isMobile, activeChat, onChangeSidebar]);

  // Fetch and log all tags (predefined + custom) on mount
  useEffect(() => {
    const fetchAndStoreTags = async () => {
      if (!projectName) return;

      try {
        // Fetch custom tags from API
        const customTags = await getTags(projectName);

        // Combine with predefined tags
        const allTags = combineAllTags(customTags);

        // Store in context for use across components
        setAvailableTags(allTags);
      } catch (error) {
        console.error('[MessagesDashboard] Error fetching tags:', error);
      }
    };

    fetchAndStoreTags();
  }, [projectName, setAvailableTags]);

  // Fetch quick replies on mount
  useEffect(() => {
    const fetchAndStoreQuickReplies = async () => {
      if (!projectName) return;

      try {
        // Fetch quick replies from API
        const quickRepliesRecord = await getQuickReplies(projectName);

        // Convert Record to Array for easier use
        const quickRepliesArray = Object.values(quickRepliesRecord);

        // Store in context for use across components
        setAvailableQuickReplies(quickRepliesArray);
      } catch (error) {
        console.error('[MessagesDashboard] Error fetching quick replies:', error);
      }
    };

    fetchAndStoreQuickReplies();
  }, [projectName, setAvailableQuickReplies]);

  // Fetch collaborators for teammate filter
  useEffect(() => {
    const fetchCollaborators = async () => {
      if (!projectName) return;

      const data = await getProjectCollaborators(projectName, true);
      if (data) {
        // Filter active and pending collaborators
        const visibleCollaborators = data.filter((c) => c.status === 'active' || c.status === 'pending');
        setCollaborators(visibleCollaborators);

        // Fetch profile pictures for all collaborators
        const picturePromises = visibleCollaborators.map(async (collaborator) => {
          const pictureUrl = await getUserPictureByEmailCached(collaborator.email, true);
          return { email: collaborator.email, pictureUrl };
        });

        const pictures = await Promise.all(picturePromises);
        const pictureMap = new Map<string, string>();
        pictures.forEach(({ email, pictureUrl }) => {
          if (pictureUrl) {
            pictureMap.set(email, pictureUrl);
          }
        });
        setProfilePictures(pictureMap);
      }
    };

    fetchCollaborators();
  }, [projectName]);

  // Merge profile pictures into collaborators for components that need them
  const collaboratorsWithProfilePics = useMemo(() => {
    return collaborators.map((collaborator) => ({
      ...collaborator,
      profilePic: profilePictures.get(collaborator.email) || collaborator.profilePic,
    }));
  }, [collaborators, profilePictures]);

  // Fetch current user email for inbox filter
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const firebaseUser = await getCurrentFirebaseUser();
      setCurrentUserEmail(firebaseUser?.email || null);
    };
    fetchCurrentUser();
  }, []);

  // Track the previous test chat message timestamp to detect new messages
  const prevTestChatTimestampRef = useRef<number | null>(null);

  // Listen for test chat AI responses via websocket to stop typing indicator
  // Only stops when receiving a text message from the assistant (not images)
  useEffect(() => {
    const testChatMessage = realtimeMessages[TEST_PHONE];
    if (!testChatMessage) return;

    // Check if this is a new message (different timestamp than previous)
    const isNewMessage =
      prevTestChatTimestampRef.current !== null &&
      testChatMessage.timestamp !== prevTestChatTimestampRef.current;

    // Update ref with current timestamp
    prevTestChatTimestampRef.current = testChatMessage.timestamp;

    // Only stop typing if:
    // 1. This is a new message (not just the initial load)
    // 2. The message is from the assistant (AI response)
    // 3. The message type is text (not image, audio, etc.)
    if (
      isNewMessage &&
      testChatMessage.message?.role === 'assistant' &&
      testChatMessage.type === 'text'
    ) {
      stopTestMessageTyping();
    }
  }, [realtimeMessages, stopTestMessageTyping]);

  // Handle fetch queue using MessageQueueService
  useEffect(() => {
    const queuedChatIds = Object.keys(fetchQueue);
    if (queuedChatIds.length === 0) return;

    // Capture current state BEFORE clearing queue to prevent race conditions
    const currentState = {
      activeChat,
      currentMessages: messages,
      currentChat,
      projectName: projectName || '',
    };

    // Clear queue IMMEDIATELY to prevent infinite loop
    repository.clearFetchQueue();

    // Process queue using service
    const processQueue = async () => {
      try {
        const results = await queueService.processQueue(queuedChatIds, currentState, {
          repository,
          realtimeMessages,
        });

        // Apply results for active chat only
        if (currentState.activeChat) {
          const activeChatResult = results[currentState.activeChat];

          if (activeChatResult) {
            // Update messages if needed
            if (activeChatResult.messagesToRemove && activeChatResult.messagesToRemove.length > 0) {
              removeMessages(activeChatResult.messagesToRemove);
            }

            if (activeChatResult.messagesToMerge && Object.keys(activeChatResult.messagesToMerge).length > 0) {
              addMessages(activeChatResult.messagesToMerge);
            }

            // Mark as read if needed
            if (activeChatResult.shouldMarkAsRead && currentState.currentChat) {
              await repository.markAsRead(
                currentState.projectName,
                currentState.activeChat,
                currentState.currentChat
              );
            }
          }
        }
      } catch (error) {
        console.error('[MessagesDashboard] Error processing queue:', error);
      }
    };

    processQueue();
  }, [fetchQueue]);

  // Track pending message highlight when switching chats
  const pendingHighlightRef = useRef<string | null>(null);

  // Message result click handler - combines chat selection + message highlighting
  const handleMessageResultClick = useCallback(
    async (chatId: string, messageId: string) => {
      const isSwitchingChat = chatId !== activeChat;

      if (isSwitchingChat) {
        // Store the message ID to highlight after chat loads
        pendingHighlightRef.current = messageId;
      }

      // Wait for chat to load
      await selectChat(chatId, false);

      if (!isSwitchingChat) {
        // Same chat - highlight immediately
        replyToMessage(messageId);
      }
      // For different chat, the useEffect below will handle highlighting
    },
    [activeChat, selectChat, replyToMessage]
  );

  // Highlight pending message after chat switch completes
  useEffect(() => {
    if (pendingHighlightRef.current && activeChat && messages && Object.keys(messages).length > 0) {
      const messageId = pendingHighlightRef.current;

      // Check if the target message is in the loaded messages
      if (messages[messageId]) {
        // Wait for next render cycle to ensure MessageView has rendered
        setTimeout(() => {
          replyToMessage(messageId);
          pendingHighlightRef.current = null;
        }, 100);
      }
    }
  }, [activeChat, messages, replyToMessage]);

  // Close mobile right panel when chat changes
  useEffect(() => {
    if (isMobile) {
      setMobileRightPanelOpen(false);
    }
  }, [isMobile, activeChat]);

  // Handler to open mobile right panel
  const handleContactClick = useCallback(() => {
    setMobileRightPanelOpen(true);
  }, []);

  // Handler for voice note upload
  const handleVoiceNoteUpload = useCallback(
    async (audioBlob: Blob, fileName: string) => {
      if (!activeChat || !projectName) return;

      const id = uuidv4();
      const audioFile = new File([audioBlob], fileName, { type: 'audio/mp4' });

      // Create media file detail for upload
      const mediaFileDetail: MediaFileDetail = {
        id,
        name: fileName,
        link: '',
        kind: MediaFileKind.M4A,
        status: MediaStatus.UPLOADING,
        file: audioFile,
      };

      // Upload to Firebase
      const groupName = `${BUSINESS_MESSAGES_GROUP_NAME}/${activeChat}`;
      const uploadedFile = await uploadFile(groupName, projectName, id, mediaFileDetail, () => {});

      // Send the uploaded file via handleMediaUpload
      handleMediaUpload({
        [uploadedFile.id]: uploadedFile,
      });
    },
    [activeChat, projectName, handleMediaUpload]
  );

  return (
    <div ref={containerRef} className="h-full w-full flex">
      {/* File picker modal */}
      {isModalOpen('file-picker') && (
        <WithFirebaseUploader
          projectName={projectName || ''}
          onFilesChange={handleMediaUpload}
          groupName={`${BUSINESS_MESSAGES_GROUP_NAME}/${activeChat}`}
          onClose={() => closeModal('file-picker')}
          onImageFilePicked={handleImageFilePicked}
        >
          <FilePicker
            multiple
            types={activeChat?.startsWith('instagram:') ? INSTAGRAM_MEDIA_SUPPORTED_TYPES : MEDIA_SUPPORTED_TYPES}
          />
        </WithFirebaseUploader>
      )}

      {/* Main content: Resizable panels for desktop, normal layout for mobile */}
      {isMobile ? (
        <>
          {/* Mobile: Keep existing layout (LeftPanel hidden on mobile) */}
          <ChatListPanel
            orderedChats={orderedChats}
            activeChat={activeChat}
            isSearchActive={isSearchActive}
            filteredChatsPhone={filteredChatsPhone}
            filteredChatsName={filteredChatsName}
            messageMatches={messageMatches}
            onChatSelect={selectChat}
            onSearchChange={performSearch}
            onClearSearch={clearSearch}
            onMessageResultClick={handleMessageResultClick}
            chatFilter={chatFilter}
            onFilterChange={setChatFilter}
            collaborators={collaborators}
            profilePictures={profilePictures}
            hideFilterDropdown={isAgent}
            onLoadMore={loadMoreConversations}
            hasMore={hasMoreConversations}
            isLoadingMore={isLoadingMoreConversations}
          />

          {activeChat && (currentChat || isTestChatActive) && (
            <div className="flex flex-col h-full w-full">
              {/* Chat header for mobile */}
              <ChatHeader
                chat={currentChat}
                chatId={activeChat}
                isTestChat={isTestChatActive}
                onBack={() => selectChat(null)}
                onDelete={() => deleteChat(activeChat)}
                showBackButton={true}
                onContactClick={handleContactClick}
                collaborators={collaborators}
                profilePictures={profilePictures}
              />

              {/* Chat view content */}
              <ChatViewPanel
                currentChat={currentChat}
                isTestChatActive={isTestChatActive}
                messages={messages}
                collaborators={collaboratorsWithProfilePics}
                isAIEnabled={isAIEnabled}
                inputMessage={inputMessage}
                onInputChange={setInputMessage}
                onSendMessage={handleSendMessage}
                onAttachmentClick={() => openModal('file-picker')}
                onVoiceNoteUpload={handleVoiceNoteUpload}
                highlightedMessageId={highlightedMessageId}
                onReplyClick={replyToMessage}
                isInquiryModalOpen={isInquiryModalOpen}
                onInquiryModalChange={(open) => (open ? openInquiryModal() : closeInquiryModal())}
                inquiryResponse={inquiryResponse}
                onInquiryResponseChange={setInquiryResponse}
                onResolveInquiry={resolveInquiry}
                inquiryLoading={inquiryLoading}
                isNodeSelectionModalOpen={isNodeSelectionModalOpen}
                onNodeSelectionModalChange={(open) => (open ? () => {} : closeNodeSelectionModal())}
                selectedNode={selectedNode}
                onNodeChange={setSelectedNode}
                onNodeConfirm={confirmNode}
                nodesList={nodesList}
                activeChatId={activeChat}
                loadOlderMessages={loadOlderMessages}
                hasMoreOlderMessages={hasMoreOlderMessages}
                isLoadingMessages={isLoadingMessages}
                isLoadingOlderMessages={isLoadingOlderMessages}
              />
            </div>
          )}

          {/* Mobile: Right panel as Sheet modal */}
          <Sheet open={mobileRightPanelOpen} onOpenChange={setMobileRightPanelOpen}>
            <SheetContent side="right" className="w-full max-w-md p-0">
              <SheetHeader className="px-4 py-3 border-b">
                <SheetTitle>{t('Contact Info')}</SheetTitle>
              </SheetHeader>
              <div className="h-full overflow-y-auto">
                {activeChat && (
                  <RightPanel
                    activeChat={activeChat}
                    messages={messages}
                    onMessageClick={(messageId) => {
                      replyToMessage(messageId);
                      setMobileRightPanelOpen(false);
                    }}
                    forceRender={true}
                    isAIEnabled={isAIEnabled}
                    onAIToggle={toggleAI}
                    isTestChat={isTestChatActive}
                  />
                )}
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : containerWidth === 0 ? (
        // Wait for container to be measured before rendering resizable panels
        <div className="flex-1" />
      ) : (
        <>
          {/* Desktop: Resizable panels - outer group for all panels including LeftPanel */}
          <ResizablePanelGroup direction="horizontal" className="flex-1">
            {/* Left navigation panel - hidden for agents who have tabs for filtering */}
            {!isAgent && (
              <ResizablePanel
                ref={leftPanelRef}
                id="left-panel"
                defaultSize={panelSizes.leftPanel}
                minSize={panelSizes.leftPanelMin}
                maxSize={panelSizes.leftPanelMax}
                order={1}
              >
                <LeftPanel
                  projectName={projectName}
                  activeFilter={chatFilter}
                  onFilterChange={setChatFilter}
                  onCollapseChange={setLeftPanelCollapsed}
                  collaborators={collaborators}
                  profilePictures={profilePictures}
                  orderedChats={orderedChats}
                  currentUserEmail={currentUserEmail}
                />
              </ResizablePanel>
            )}

            {/* Hide resize handle when LeftPanel is collapsed or user is agent */}
            {!isAgent && !leftPanelCollapsed && <ResizableHandle />}

            {/* Remaining panels wrapper - takes rest of space (100% for agents) */}
            <ResizablePanel id="remaining-panels" defaultSize={isAgent ? 100 : 100 - panelSizes.leftPanel} order={2}>
              <ResizablePanelGroup direction="horizontal" className="h-full">
                {/* Chat list panel - resizable (calculated to be 280px initially) */}
                <ResizablePanel id="chat-list-panel" defaultSize={panelSizes.chatList} order={1}>
                  <ChatListPanel
                    orderedChats={orderedChats}
                    activeChat={activeChat}
                    isSearchActive={isSearchActive}
                    filteredChatsPhone={filteredChatsPhone}
                    filteredChatsName={filteredChatsName}
                    messageMatches={messageMatches}
                    onChatSelect={selectChat}
                    onSearchChange={performSearch}
                    onClearSearch={clearSearch}
                    onMessageResultClick={handleMessageResultClick}
                    chatFilter={chatFilter}
                    onFilterChange={setChatFilter}
                    collaborators={collaborators}
                    profilePictures={profilePictures}
                    hideFilterDropdown={isAgent}
                    onLoadMore={loadMoreConversations}
                    hasMore={hasMoreConversations}
                    isLoadingMore={isLoadingMoreConversations}
                  />
                </ResizablePanel>

                <ResizableHandle />

                {/* Chat view and right panel wrapper - takes remaining space */}
                <ResizablePanel id="chat-view-panel" defaultSize={panelSizes.chatView} order={2}>
                  {activeChat && (currentChat || isTestChatActive) ? (
                    <div className="flex flex-col h-full">
                      {/* Shared header for both chat view and right panel */}
                      <ChatHeader
                        chat={currentChat}
                        chatId={activeChat}
                        isTestChat={isTestChatActive}
                        onBack={() => selectChat(null)}
                        onDelete={() => deleteChat(activeChat)}
                        showBackButton={false}
                        collaborators={collaborators}
                        profilePictures={profilePictures}
                      />

                      {/* Content area with chat view and right panel */}
                      <div className="flex flex-1 overflow-hidden">
                        <ResizablePanelGroup direction="horizontal" className="h-full">
                          {/* Chat view content */}
                          <ResizablePanel
                            id="chat-messages"
                            defaultSize={100 - panelSizes.rightPanelInChatView}
                            order={1}
                          >
                            <ChatViewPanel
                              currentChat={currentChat}
                              isTestChatActive={isTestChatActive}
                              messages={messages}
                              collaborators={collaboratorsWithProfilePics}
                              isAIEnabled={isAIEnabled}
                              inputMessage={inputMessage}
                              onInputChange={setInputMessage}
                              onSendMessage={handleSendMessage}
                              onAttachmentClick={() => openModal('file-picker')}
                              onVoiceNoteUpload={handleVoiceNoteUpload}
                              highlightedMessageId={highlightedMessageId}
                              onReplyClick={replyToMessage}
                              isInquiryModalOpen={isInquiryModalOpen}
                              onInquiryModalChange={(open) =>
                                open ? openInquiryModal() : closeInquiryModal()
                              }
                              inquiryResponse={inquiryResponse}
                              onInquiryResponseChange={setInquiryResponse}
                              onResolveInquiry={resolveInquiry}
                              inquiryLoading={inquiryLoading}
                              isNodeSelectionModalOpen={isNodeSelectionModalOpen}
                              onNodeSelectionModalChange={(open) =>
                                open ? () => {} : closeNodeSelectionModal()
                              }
                              selectedNode={selectedNode}
                              onNodeChange={setSelectedNode}
                              onNodeConfirm={confirmNode}
                              nodesList={nodesList}
                              activeChatId={activeChat}
                              loadOlderMessages={loadOlderMessages}
                              hasMoreOlderMessages={hasMoreOlderMessages}
                              isLoadingMessages={isLoadingMessages}
                              isLoadingOlderMessages={isLoadingOlderMessages}
                            />
                          </ResizablePanel>

                          <ResizableHandle />

                          <ResizablePanel
                            id="right-panel"
                            defaultSize={panelSizes.rightPanelInChatView}
                            order={2}
                          >
                            <RightPanel
                              activeChat={activeChat}
                              messages={messages}
                              onMessageClick={replyToMessage}
                              isAIEnabled={isAIEnabled}
                              onAIToggle={toggleAI}
                              isTestChat={isTestChatActive}
                            />
                          </ResizablePanel>
                        </ResizablePanelGroup>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full w-full">
                      <ChatEmptyState />
                    </div>
                  )}
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </>
      )}
    </div>
  );
};

MessagesDashboardLayout.displayName = 'MessagesDashboardLayout';
