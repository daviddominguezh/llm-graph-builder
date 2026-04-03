import type { ModelMessage } from 'ai';

export enum AI_MESSAGE_ROLES {
  ASSISTANT = 'assistant',
  DEVELOPER = 'developer',
  USER = 'user',
}

export enum INTENT {
  NONE = 'NONE',
  GREETING = 'GREETING',
  CHECKOUT = 'CHECKOUT',
  TRACK = 'TRACK',
  SUPPORT = 'SUPPORT',
  BROWSE = 'BROWSE',
  BOOKING = 'BOOKING',
}

export interface Message {
  id: string;
  timestamp: number;
  originalId: string;
  intent: INTENT;
  message: ModelMessage;
  type:
    | 'text'
    | 'audio'
    | 'image'
    | 'video'
    | 'pdf'
    | 'document'
    | 'note'
    | 'assignee-change'
    | 'status-change';
  mediaUrl?: string | null;
  replyId?: string | null;
  key?: string;
  isTest?: boolean;
}

export interface LastMessage extends Message {
  read: boolean;
  enabled: boolean;
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
  status?: string | null;
  query?: string | null;
  name?: string;
  key?: string;
  isTestChat?: boolean;
  unansweredCount?: number;
}

export type LastMessages = Record<string, LastMessage>;
export type Conversation = Record<string, Message>;

export interface ChatSearchResult {
  chatId: string;
  matchingMessageIds: string[];
  matchType: 'phone' | 'message' | 'both';
  phoneMatch: boolean;
  nameMatch: boolean;
  messageMatch: boolean;
}

export interface ChatSearchResults {
  results: ChatSearchResult[];
  totalMatches: number;
}
