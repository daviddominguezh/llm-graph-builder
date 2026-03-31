export interface QuickReply {
  quickReplyID: string;
  title: string;
  text: string;
  shortcut?: string;
  category?: string;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface QuickRepliesResponse {
  quickReplies: Record<string, QuickReply>;
}

export interface CreateQuickReplyRequest {
  title: string;
  text: string;
  shortcut?: string;
  category?: string;
  description?: string;
}

export interface CreateQuickReplyResponse {
  status: 'ok';
  quickReplyID: string;
}
