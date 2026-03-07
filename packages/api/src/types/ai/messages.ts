import type { ModelMessage } from 'ai';

export enum MESSAGES_PROVIDER {
  WEB = 'web',
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
}

export type AI_MESSAGE_ROLES = 'assistant' | 'user' | 'system' | 'tool';

export interface Message {
  provider: MESSAGES_PROVIDER;
  id: string;
  timestamp: number;
  originalId: string;
  type: 'text' | 'audio' | 'image' | 'sticker' | 'video' | 'document';
  message: ModelMessage;
  mimeType?: string;
  mediaUrl?: string | null;
  replyId?: string | null;
  key?: string | null;
  currentAssignee?: string;
  assignmentType?: 'human' | 'ai';
  assignedAt?: number;
  replied?: boolean;
}

export interface LastMessage extends Message {
  read: boolean;
  enabled: boolean;
  tags?: string[] | null;
  status?: string | null;
  query?: string | null;
  paymentId?: string | null;
  name?: string;
  key?: string | null;
  currentAssignee?: string;
  assignmentType?: 'human' | 'ai';
  assignedAt?: number;
}
