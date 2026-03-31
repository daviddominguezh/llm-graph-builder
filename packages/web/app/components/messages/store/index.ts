/* eslint-disable @typescript-eslint/no-dynamic-delete */
import { type PayloadAction, createSlice } from '@reduxjs/toolkit';
import { type StateType } from '@store/index';
import { castDraft } from 'immer';

import { LastMessage, LastMessages } from '@globalTypes/chat';

export const MessagesPath = 'messages';

interface InitialEditorState {
  lastMessages: LastMessages | null;
  fetchQueue: Record<string, boolean>;
  notificationsEnabled: boolean;
  realtimeMessages: Record<string, LastMessage>; // Store real-time messages from WebSocket
}

interface SetLastMessagePayload {
  id: string;
  lastMessage: LastMessage;
  preventFetch?: boolean;
}

interface RemoveLastMessagePayload {
  id: string;
}

interface UpdateAssigneePayload {
  chatId: string;
  assignee: string;
}

interface UpdateStatusPayload {
  chatId: string;
  status: string;
}

interface ClearVerifyPaymentStatusPayload {
  chatId: string;
}

interface MergeLastMessagesPayload {
  /** New conversations to merge */
  conversations: Record<string, LastMessage>;
}

interface RemoveMultipleLastMessagesPayload {
  /** Chat IDs to remove */
  chatIds: string[];
}

const initialData: InitialEditorState = {
  lastMessages: null,
  fetchQueue: {},
  notificationsEnabled: false,
  realtimeMessages: {},
};

export const MessagesSlice = createSlice({
  name: MessagesPath,
  initialState: initialData,
  reducers: {
    setLastMessage: (state, action: PayloadAction<SetLastMessagePayload>) => {
      const { id, lastMessage, preventFetch } = action.payload;
      let msgs: LastMessages = {};
      if (!state.lastMessages) state.lastMessages = {};
      msgs = state.lastMessages as LastMessages;

      // Handle unansweredCount based on message role and AI state
      const previousMessage = msgs[id];

      const isUserMessage = lastMessage.message?.role === 'user';
      const isAssistantMessage = lastMessage.message?.role === 'assistant';
      const isAIDisabled = !lastMessage.enabled;

      let finalUnansweredCount = lastMessage.unansweredCount;

      // If unansweredCount is explicitly provided, use it
      if (lastMessage.unansweredCount !== undefined) {
        finalUnansweredCount = lastMessage.unansweredCount;
      }
      // If assistant (business) sends a message, reset count to 0
      else if (isAssistantMessage && isAIDisabled) {
        finalUnansweredCount = 0;
      }
      // If user sends a message and AI is disabled, increment count
      else if (isUserMessage && isAIDisabled && previousMessage !== undefined) {
        finalUnansweredCount = (previousMessage.unansweredCount || 0) + 1;
      }
      // Otherwise, preserve existing count if AI is disabled
      else if (isAIDisabled && previousMessage?.unansweredCount !== undefined) {
        finalUnansweredCount = previousMessage.unansweredCount;
      }

      // Preserve certain fields from previous message if not provided in the update
      // This prevents issues where server sends partial data (e.g., AI responses without 'enabled' field)
      const preservedEnabled =
        lastMessage.enabled !== undefined ? lastMessage.enabled : previousMessage?.enabled;
      const preservedName = lastMessage.name !== undefined ? lastMessage.name : previousMessage?.name;

      msgs[id] = {
        ...lastMessage,
        ...(preservedEnabled !== undefined && { enabled: preservedEnabled }),
        ...(preservedName !== undefined && { name: preservedName }),
        ...(finalUnansweredCount !== undefined && { unansweredCount: finalUnansweredCount }),
      };

      // Store the full message for real-time access
      // Use castDraft to handle complex nested types with Immer
      state.realtimeMessages[id] = castDraft(msgs[id]);

      if (preventFetch == undefined || !preventFetch) {
        state.fetchQueue[id] = true;
      }
    },
    removeLastMessage: (state, action: PayloadAction<RemoveLastMessagePayload>) => {
      const { id } = action.payload;
      const messages = state.lastMessages || {};
      delete messages[id];
    },
    setAllLastMessages: (state, action: PayloadAction<LastMessages | null>) => {
      (state.lastMessages as LastMessages) = action.payload as LastMessages;
    },
    cleanFetchQueue: (state) => {
      state.fetchQueue = {};
    },
    setNotificationsEnabled: (state, action: PayloadAction<boolean>) => {
      state.notificationsEnabled = action.payload;
    },
    updateAssigneeOptimistic: (state, action: PayloadAction<UpdateAssigneePayload>) => {
      const { chatId, assignee } = action.payload;
      if (!state.lastMessages || !state.lastMessages[chatId]) return;

      const lastMessage = state.lastMessages[chatId];
      const timestamp = Date.now();

      // Initialize assignees if it doesn't exist
      if (!lastMessage.assignees) {
        lastMessage.assignees = {};
      }

      // Add new assignee entry with current timestamp
      const assigneeId = `assignee-${timestamp}`;
      lastMessage.assignees[assigneeId] = {
        assignee,
        timestamp,
      };

      // Update realtimeMessages as well
      if (state.realtimeMessages[chatId]) {
        const rtMessage = state.realtimeMessages[chatId];
        if (!rtMessage.assignees) {
          rtMessage.assignees = {};
        }
        rtMessage.assignees[assigneeId] = {
          assignee,
          timestamp,
        };
      }
    },
    updateStatusOptimistic: (state, action: PayloadAction<UpdateStatusPayload>) => {
      const { chatId, status } = action.payload;
      if (!state.lastMessages || !state.lastMessages[chatId]) return;

      const lastMessage = state.lastMessages[chatId];
      const timestamp = Date.now();

      // Initialize statuses if it doesn't exist
      if (!lastMessage.statuses) {
        lastMessage.statuses = {};
      }

      // Add new status entry with current timestamp
      const statusId = `status-${timestamp}`;
      lastMessage.statuses[statusId] = {
        status,
        timestamp,
      };

      // Update realtimeMessages as well
      if (state.realtimeMessages[chatId]) {
        const rtMessage = state.realtimeMessages[chatId];
        if (!rtMessage.statuses) {
          rtMessage.statuses = {};
        }
        rtMessage.statuses[statusId] = {
          status,
          timestamp,
        };
      }
    },
    clearVerifyPaymentStatus: (state, action: PayloadAction<ClearVerifyPaymentStatusPayload>) => {
      const { chatId } = action.payload;
      if (!state.lastMessages || !state.lastMessages[chatId]) return;

      const lastMessage = state.lastMessages[chatId];

      // Clear the status field (used for verify-payment)
      if (lastMessage.status === 'verify-payment') {
        lastMessage.status = null;
      }

      // Update realtimeMessages as well
      if (state.realtimeMessages[chatId]) {
        const rtMessage = state.realtimeMessages[chatId];
        if (rtMessage.status === 'verify-payment') {
          rtMessage.status = null;
        }
      }
    },
    /**
     * Merge new conversations with existing ones
     * Uses highest timestamp wins strategy for conflicts
     */
    mergeLastMessages: (state, action: PayloadAction<MergeLastMessagesPayload>) => {
      const { conversations } = action.payload;
      if (!state.lastMessages) {
        state.lastMessages = {};
      }

      for (const [id, newMsg] of Object.entries(conversations)) {
        const existing = state.lastMessages[id];
        // Only update if new message has higher timestamp or doesn't exist
        if (!existing || newMsg.timestamp > existing.timestamp) {
          state.lastMessages[id] = castDraft(newMsg);
          state.realtimeMessages[id] = castDraft(newMsg);
        }
      }
    },
    /**
     * Remove multiple conversations by their IDs
     * Used for deleted chats sync
     */
    removeMultipleLastMessages: (state, action: PayloadAction<RemoveMultipleLastMessagesPayload>) => {
      const { chatIds } = action.payload;
      if (!state.lastMessages) return;

      for (const id of chatIds) {
        delete state.lastMessages[id];
        delete state.realtimeMessages[id];
      }
    },
  },
});

export const getLastMessagesFromStore = (state: StateType) => state[MessagesPath].lastMessages;
export const getFetchQueue = (state: StateType) => state[MessagesPath].fetchQueue;
export const getNotificationsEnabled = (state: StateType) => state[MessagesPath].notificationsEnabled;
export const getRealtimeMessages = (state: StateType) => state[MessagesPath].realtimeMessages;

export const {
  setNotificationsEnabled,
  setLastMessage,
  setAllLastMessages,
  cleanFetchQueue,
  removeLastMessage,
  updateAssigneeOptimistic,
  updateStatusOptimistic,
  clearVerifyPaymentStatus,
  mergeLastMessages,
  removeMultipleLastMessages,
} = MessagesSlice.actions;

export const MessagesReducer = MessagesSlice.reducer;
