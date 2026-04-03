// ============================================================================
// Messaging Types
// ============================================================================

// --- Database Row Types ---

export interface ConversationRow {
  id: string;
  org_id: string;
  agent_id: string;
  tenant_id: string;
  user_channel_id: string;
  thread_id: string;
  channel: 'whatsapp' | 'instagram' | 'api';
  last_message_content: string | null;
  last_message_role: string | null;
  last_message_type: string | null;
  last_message_at: string | null;
  read: boolean;
  enabled: boolean;
  status: 'open' | 'blocked' | 'closed';
  name: string | null;
  unanswered_count: number;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'note' | 'assignee-change' | 'status-change';
  type: 'text' | 'image' | 'audio' | 'video' | 'pdf' | 'document';
  content: string | null;
  media_url: string | null;
  reply_id: string | null;
  original_id: string | null;
  channel_thread_id: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: number;
  created_at: string;
}

export interface MessageAiRow extends MessageRow {
  is_summary: boolean;
}

export interface ConversationNoteRow {
  id: string;
  conversation_id: string;
  creator_email: string;
  content: string;
  created_at: string;
}

export interface ConversationAssigneeRow {
  id: string;
  conversation_id: string;
  assignee: string;
  created_at: string;
}

export interface ConversationStatusRow {
  id: string;
  conversation_id: string;
  status: string;
  created_at: string;
}

export interface DeletedConversationRow {
  id: string;
  conversation_id: string;
  tenant_id: string;
  deleted_at: string;
}

export interface EndUserRow {
  id: string;
  tenant_id: string;
  user_channel_id: string;
  name: string | null;
  first_seen_at: string;
}

export interface ChannelConnectionRow {
  id: string;
  org_id: string;
  agent_id: string;
  tenant_id: string;
  channel_type: 'whatsapp' | 'instagram' | 'api';
  channel_identifier: string | null;
  enabled: boolean;
  created_at: string;
}

export interface WhatsAppCredentialRow {
  id: string;
  channel_connection_id: string;
  phone_number_id: string;
  waba_id: string;
  phone_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstagramCredentialRow {
  id: string;
  channel_connection_id: string;
  ig_user_id: string;
  ig_username: string | null;
  created_at: string;
  updated_at: string;
}

// --- API / Wire Types ---

export interface ConversationSnapshotMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssigneeEntry {
  assignee: string;
  timestamp: number;
}

export interface StatusEntry {
  status: string;
  timestamp: number;
}

export interface ConversationSnapshot {
  id: string;
  key: string;
  timestamp: number;
  read: boolean;
  enabled: boolean;
  status: string | null;
  name: string | undefined;
  unansweredCount: number;
  message: ConversationSnapshotMessage;
  type: string;
  originalId: string;
  intent: string;
  assignees: Record<string, AssigneeEntry>;
  statuses: Record<string, StatusEntry>;
}

export interface PaginationCursor {
  timestamp: number;
  key: string;
}

export interface PaginatedResponse<T> {
  messages: T;
  hasMore: boolean;
  nextCursor: PaginationCursor | null;
}

// --- Send Message Types ---

export interface SendMessageBody {
  message: string;
  userID: string;
  tenantId: string;
  agentId: string;
  type: 'text' | 'image' | 'audio' | 'pdf';
  id?: string;
}

export interface SendTestMessageBody {
  message: string;
  tenantId: string;
  agentId: string;
  type: 'text' | 'image' | 'audio' | 'pdf';
  id?: string;
}

// --- Provider Send Result ---

export interface ProviderSendResult {
  originalId: string;
}

// --- Incoming Webhook Parsed Message ---

export interface IncomingMessage {
  userChannelId: string;
  channelIdentifier: string;
  content: string;
  type: string;
  originalId: string;
  userName: string | undefined;
  mediaId: string | undefined;
  replyOriginalId: string | undefined;
  timestamp: number;
}

// --- Channel Types ---

export type ChannelType = 'whatsapp' | 'instagram' | 'api';

export type MessageProvider = 'whatsapp' | 'instagram' | 'test';

export const TEST_USER_CHANNEL_ID = 'test:console';

// --- WhatsApp Webhook Types ---

export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookChange {
  value: {
    messaging_product: string;
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: Array<{
      profile: { name: string };
      wa_id: string;
    }>;
    messages?: WhatsAppIncomingMessage[];
    statuses?: Array<{
      id: string;
      status: string;
      timestamp: string;
      recipient_id: string;
    }>;
  };
  field: string;
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker';
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string };
  video?: { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; filename: string; caption?: string };
  sticker?: { id: string; mime_type: string };
  context?: { message_id: string };
}

// --- Instagram Webhook Types ---

export interface InstagramWebhookEntry {
  id: string;
  time: number;
  messaging: InstagramMessagingEvent[];
}

export interface InstagramMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    attachments?: Array<{
      type: 'image' | 'video' | 'audio' | 'file';
      payload: { url: string };
    }>;
    reply_to?: { mid: string };
  };
}

// --- AI Helper Types ---

export interface AiHelperRequest {
  text: string;
  agentId: string;
  context?: string;
}

export interface AiHelperResponse {
  text: string;
}

// --- Route Body Types ---

export interface CreateNoteBody {
  creator: string;
  content: string;
}

export interface AssigneeBody {
  assignee: string;
}

export interface StatusBody {
  status: string;
}
