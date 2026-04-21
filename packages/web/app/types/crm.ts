import type { LastMessage } from './chat';
import type { FinalUserInfoAPI } from './finalUsers';

export interface ChatNote {
  content: string;
  creator: string;
  timestamp: number;
}

export interface ChatCRMData {
  notes: Record<string, ChatNote>;
  lastMessage: LastMessage | null;
  userInfo: FinalUserInfoAPI | null;
}

export type CRMAPIResponse = Record<string, ChatCRMData>;

export interface CRMEntry extends ChatCRMData {
  id: string;
}
