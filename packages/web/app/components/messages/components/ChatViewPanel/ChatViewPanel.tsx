
import React, { Suspense, lazy, memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';

import { getCurrentFirebaseUser } from '@/app/components/messages/services/firebase';

import type { Conversation, LastMessage } from '@/app/types/chat';
import { Collaborator } from '@/app/types/projectInnerSettings';

import { useChat, useMessage } from '../../core/contexts';
import { useNow } from '../../hooks/useNow';
import { Slot } from '../../core/slots';
import { MessageInput } from '../../domains/message/components/MessageInput';
import { MessageView } from '../../domains/message/components/MessageView';
import { TypingIndicator } from '../../domains/message/components/TypingIndicator';
// Code splitting: Lazy load modals (only loaded when opened)
const InquiryModal = lazy(() =>
  import('../../domains/message/components/InquiryModal').then((module) => ({
    default: module.InquiryModal,
  }))
);
const NodeSelectionModal = lazy(() =>
  import('../../domains/message/components/NodeSelectionModal').then((module) => ({
    default: module.NodeSelectionModal,
  }))
);

interface ChatViewPanelProps {
  // Chat data
  currentChat: LastMessage | null;
  isTestChatActive: boolean;
  messages: Conversation;
  collaborators?: Collaborator[];

  // Message input
  inputMessage: string;
  onInputChange: (value: string) => void;
  onSendMessage: (message: string, mode: 'reply' | 'note') => void;
  onAttachmentClick: () => void;
  onVoiceNoteUpload: (audioBlob: Blob, fileName: string) => Promise<void>;

  // Message interaction
  highlightedMessageId: string | null;
  onReplyClick: (messageId: string) => void;

  // Inquiry modal
  isInquiryModalOpen: boolean;
  onInquiryModalChange: (open: boolean) => void;
  inquiryResponse: string;
  onInquiryResponseChange: (response: string) => void;
  onResolveInquiry: () => void;
  inquiryLoading: boolean;

  // Node selection modal
  isNodeSelectionModalOpen: boolean;
  onNodeSelectionModalChange: (open: boolean) => void;
  selectedNode: string;
  onNodeChange: (node: string) => void;
  onNodeConfirm: () => void;
  nodesList: Array<{ nodeId: string; description: string }>;

  // Active chat ID
  activeChatId: string;

  // AI state (for message input disabled state)
  isAIEnabled: boolean;

  // Pagination props
  loadOlderMessages?: () => Promise<void>;
  hasMoreOlderMessages?: boolean;
  isLoadingMessages?: boolean;
  isLoadingOlderMessages?: boolean;
}

/**
 * ChatViewPanel
 *
 * Displays the active conversation with messages, input field, and chat header.
 * Responsibilities:
 * - Render chat header with controls
 * - Display message list
 * - Render message input field
 * - Handle inquiry and node selection modals
 * - Manage WhatsApp-style background
 */
const ChatViewPanelComponent: React.FC<ChatViewPanelProps> = ({
  currentChat,
  isTestChatActive,
  messages,
  collaborators = [],
  isAIEnabled,
  inputMessage,
  onInputChange,
  onSendMessage,
  onAttachmentClick,
  onVoiceNoteUpload,
  highlightedMessageId,
  onReplyClick,
  isInquiryModalOpen,
  onInquiryModalChange,
  inquiryResponse,
  onInquiryResponseChange,
  onResolveInquiry,
  inquiryLoading,
  isNodeSelectionModalOpen,
  onNodeSelectionModalChange,
  selectedNode,
  onNodeChange,
  onNodeConfirm,
  nodesList,
  activeChatId,
  loadOlderMessages,
  hasMoreOlderMessages,
  isLoadingMessages,
  isLoadingOlderMessages,
}) => {
  const { notes } = useChat();
  const { isSendingTestMessage } = useMessage();
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [askAIQuestion, setAskAIQuestion] = useState<string | null>(null);

  // Get current user email
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const firebaseUser = await getCurrentFirebaseUser();
      setCurrentUserEmail(firebaseUser?.email || null);
    };
    fetchCurrentUser();
  }, []);

  // Get latest assignee from chat (highest timestamp)
  const currentAssignee = useMemo(() => {
    if (!currentChat?.assignees) return null;

    const assigneeEntries = Object.values(currentChat.assignees);
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
  }, [currentChat]);

  // Get assignee name for display
  const assigneeName = useMemo(() => {
    if (!currentAssignee) return null;
    const assignedCollaborator = collaborators.find((c) => c.email === currentAssignee);
    return assignedCollaborator?.name || currentAssignee;
  }, [currentAssignee, collaborators]);

  // Check if current user is the assignee
  const isAssignedToCurrentUser = useMemo(() => {
    return currentAssignee === currentUserEmail;
  }, [currentAssignee, currentUserEmail]);

  // Handle Ask AI from message dropdown
  const handleAskAI = useCallback((messageText: string) => {
    setAskAIQuestion(messageText);
  }, []);

  // Current timestamp obtained via useSyncExternalStore (React Compiler-safe).
  // Refreshes every 60 seconds so the 24-hour rule stays accurate.
  const now = useNow(60_000);

  // Check if last user message was more than 23h 50m ago (86100000 milliseconds)
  // Never apply this rule to the test chat
  const isDisabledBy24HourRule = useMemo(() => {
    // Test chat is exempt from the 24-hour rule
    if (isTestChatActive) return false;

    const messagesArray = Object.values(messages);
    const userMessages = messagesArray.filter((msg) => msg.message?.role === 'user');

    if (userMessages.length === 0) return false;

    // Sort by timestamp descending to get the last user message
    const lastUserMessage = userMessages.sort((a, b) => b.timestamp - a.timestamp)[0];
    const timeDifference = now - lastUserMessage.timestamp;

    // 23 hours 50 minutes = 1430 minutes = 86100000 milliseconds
    return timeDifference > 86100000;
  }, [messages, isTestChatActive, now]);

  // Disable input if:
  // 1. AI is enabled (disabled = true), OR
  // 2. There's an assignee and it's not the current user, OR
  // 3. Last user message was more than 23h 50m ago
  const shouldDisableInput =
    isAIEnabled || (currentAssignee !== null && !isAssignedToCurrentUser) || isDisabledBy24HourRule;
  return (
    <Card
      className="h-full flex flex-col bg-transparent border border-b-0 border-r-0 pb-0"
      style={{
        boxShadow: 'none',
        borderRadius: '0px',
        minHeight: '0',
        minWidth: '0px',
        flex: '1 1 0',
      }}
    >
      {/* Slot: After chat header - for notifications, banners, etc. */}
      <Slot name="chat-header-after" />

      {/* Main content area with chat view */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left side: Chat messages and input */}
        <CardContent
          className="overflow-hidden p-0 bg-transparent flex-1"
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 0',
            minHeight: 0,
            position: 'relative',
          }}
        >
          {/* Inquiry modal (lazy loaded) */}
          {currentChat?.status === 'boss' && (
            <Suspense fallback={null}>
              <InquiryModal
                isOpen={isInquiryModalOpen}
                onOpenChange={onInquiryModalChange}
                query={currentChat?.query || ''}
                response={inquiryResponse}
                onResponseChange={onInquiryResponseChange}
                onResolve={onResolveInquiry}
                isLoading={inquiryLoading}
              />
            </Suspense>
          )}

          {/* Node selection modal (lazy loaded) */}
          <Suspense fallback={null}>
            <NodeSelectionModal
              isOpen={isNodeSelectionModalOpen}
              onOpenChange={onNodeSelectionModalChange}
              nodes={nodesList}
              selectedNode={selectedNode}
              onNodeChange={onNodeChange}
              onConfirm={onNodeConfirm}
            />
          </Suspense>

          {/* Slot: Before message view - for pinned messages, context banners, etc. */}
          <Slot name="message-view-before" />

          {/* Message view */}
          <MessageView
            messages={messages}
            notes={notes}
            assignees={currentChat?.assignees}
            statuses={currentChat?.statuses}
            collaborators={collaborators}
            isTestChatActive={isTestChatActive}
            channel={currentChat?.channel}
            highlightedMessageId={highlightedMessageId}
            onReplyClick={onReplyClick}
            onAskAI={handleAskAI}
            chatId={activeChatId}
            loadOlderMessages={loadOlderMessages}
            hasMoreOlderMessages={hasMoreOlderMessages}
            isLoadingMessages={isLoadingMessages}
            isLoadingOlderMessages={isLoadingOlderMessages}
          />

          {/* Slot: After message view - for floating action buttons, scroll indicators, etc. */}
          <Slot name="message-view-after" />

          {/* Slot: Before message input - for quick replies, suggestions, etc. */}
          <Slot name="message-input-before" />

          {/* Typing indicator - only shown in test chat while sending */}
          {isTestChatActive && isSendingTestMessage && <TypingIndicator />}

          {/* Message input */}
          <MessageInput
            value={inputMessage}
            onChange={onInputChange}
            onSend={onSendMessage}
            onAttachmentClick={onAttachmentClick}
            onVoiceNoteUpload={onVoiceNoteUpload}
            disabled={shouldDisableInput}
            disabledByAI={isAIEnabled}
            disabledBy24HourRule={isDisabledBy24HourRule}
            askAIQuestion={askAIQuestion}
            onAskAIQuestionHandled={() => setAskAIQuestion(null)}
            disabledByAssignee={currentAssignee !== null && !isAssignedToCurrentUser}
            assigneeName={assigneeName}
            collaborators={collaborators}
          />

          {/* Slot: After message input - for formatting toolbar, send options, etc. */}
          <Slot name="message-input-after" />
        </CardContent>
      </div>
    </Card>
  );
};

// Memoize to prevent re-renders when props don't change (especially inputMessage)
export const ChatViewPanel = memo(ChatViewPanelComponent);

ChatViewPanel.displayName = 'ChatViewPanel';
