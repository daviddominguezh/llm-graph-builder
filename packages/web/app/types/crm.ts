import type { LastMessage } from './chat';
import type { FinalUserInfoAPI } from './finalUsers';
import type { Order } from './orders';

export interface OrderItemPersonalization {
  id: string;
  quantity: number;
  personalizations?: Array<{ type: string; value: string }> | null;
}

export interface OrderPersonalizationAPI {
  items?: OrderItemPersonalization[];
  ready?: boolean;
}

export interface ChatActivity {
  timestamp: number;
  activity: string;
}

export interface ChatNote {
  content: string;
  creator: string;
  timestamp: number;
}

export interface ChatCRMData {
  activity: Record<string, ChatActivity>;
  notes: Record<string, ChatNote>;
  lastMessage: LastMessage | null;
  userInfo: FinalUserInfoAPI | null;
  orders: Record<string, Order>;
  productsShown: string[];
  cart: OrderPersonalizationAPI;
}

export type CRMAPIResponse = Record<string, ChatCRMData>;

export interface CRMEntry extends ChatCRMData {
  id: string;
}
