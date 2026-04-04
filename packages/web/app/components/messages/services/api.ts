/* eslint-disable @typescript-eslint/no-unused-vars */
import { createCacheService } from '@/app/components/messages/core/services/CacheService';
import type {
  DeletedChatsResponse,
  DeltaLastMessagesResponse,
  PaginatedLastMessagesResponse,
  PaginationCursor,
} from '@/app/components/messages/core/types';
import { getAuthToken, handleAuthError } from '@/app/components/messages/services/auth';
import { isPublicEndpoint as checkIsPublicEndpoint } from '@/app/components/messages/shared/constStubs';
import { isLocalDevelopment } from '@/app/components/messages/shared/utilStubs';
import { Conversation, INTENT, LastMessage, LastMessages, Message } from '@/app/types/chat';
import { FinalUserInfoAPI } from '@/app/types/finalUsers';
import { MediaFileDetail, MediaFileKind } from '@/app/types/media';
import { Collaborator, InnerSettings } from '@/app/types/projectInnerSettings';

const API_BASE_URL = '/api/messaging';

/**
 * Get authorization headers for protected API endpoints
 * @param url - The full URL being requested
 * @returns Headers object with Authorization and uid headers if needed
 */
const getAuthHeaders = async (url: string): Promise<HeadersInit> => {
  if (checkIsPublicEndpoint(url)) {
    return {};
  }

  const headers: Record<string, string> = {};

  const apiKey = process.env.NEXT_PUBLIC_CLOSER_API_KEY;
  if (apiKey) {
    headers.api_key = apiKey;
  }

  const token = await getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const { getCurrentFirebaseUser } = await import('@/app/components/messages/services/firebase');
  const firebaseUser = await getCurrentFirebaseUser();
  if (firebaseUser) {
    headers.uid = firebaseUser.uid;
  }

  return headers;
};

/**
 * Enhanced fetch that handles auth errors
 * @param url - Request URL
 * @param options - Fetch options
 * @returns Response
 */
const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  try {
    // Get auth headers
    const authHeaders = await getAuthHeaders(url);

    // Merge auth headers with existing headers
    const headers = {
      ...(options.headers || {}),
      ...authHeaders,
    };

    if (isLocalDevelopment()) {
      // DEBUG: Log all API requests to track excessive calls
      console.debug('[API Request]', {
        method: options.method || 'GET',
        url,
        timestamp: new Date().toISOString(),
        stack: new Error().stack?.split('\n').slice(2, 6).join('\n'),
      });
    }

    // Make the request using native fetch (not authenticatedFetch!)
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle authentication errors
    if (response.status === 401 || response.status === 403) {
      console.error('[API] Authentication error:', response.status);
      handleAuthError(new Error(`Auth error: ${response.status}`)); // Triggers immediate redirect, no await needed
      throw new Error('Authentication failed');
    }

    return response;
  } catch (error) {
    console.error('[API] Request failed:', error);
    throw error;
  }
};

export const getUserPictureByEmail = async (email: string): Promise<string | null> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/auth/${email}/pic`, {
      method: 'GET',
    });
    if (!response.ok) {
      return null;
    }
    const body = await response.json();
    if (!body || !body.url) {
      return null;
    }
    return body.url;
  } catch (error) {
    console.error('Error getting user picture by email:', error);
    return null;
  }
};

// Track in-flight picture requests to prevent concurrent duplicate fetches
const userPicturePendingRequests: Map<string, Promise<string | null>> = new Map();

/**
 * Get user profile picture by email with caching
 * @param email - User email
 * @param cache - If true, cache the result for 1 day
 * @returns Picture URL or null
 */
export const getUserPictureByEmailCached = async (email: string, cache = false): Promise<string | null> => {
  const cacheService = createCacheService('localStorage');

  // Try to get from cache if caching is enabled
  if (cache) {
    const cached = await cacheService.get('user-pictures', email);
    if (cached && cached.data) {
      return cached.data as string;
    }
  }

  // Check if there's already a pending request for this email
  const pendingRequest = userPicturePendingRequests.get(email);
  if (pendingRequest) {
    return pendingRequest;
  }

  // Create and track the fetch promise
  const fetchPromise = (async () => {
    try {
      const pictureUrl = await getUserPictureByEmail(email);

      // Cache if enabled and data exists
      if (cache && pictureUrl) {
        const TTL = 24 * 60 * 60 * 1000; // 1 day (24 hours)
        await cacheService.set('user-pictures', email, pictureUrl, TTL);
      }

      return pictureUrl;
    } finally {
      // Clean up pending request
      userPicturePendingRequests.delete(email);
    }
  })();

  userPicturePendingRequests.set(email, fetchPromise);
  return fetchPromise;
};

export const getFinalUserInfo = async (namespace: string, id: string): Promise<FinalUserInfoAPI> => {
  const emptyFinalUser = {
    name: undefined,
    city: undefined,
    gender: undefined,
  };
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/users/${id}`, {
      method: 'GET',
    });

    if (!response.ok) {
      return emptyFinalUser;
    }
    const body = await response.json();
    if (!body || !body.user) {
      return emptyFinalUser;
    }
    return body.user;
  } catch (error) {
    console.error('Error getting final user info:', error);
    return emptyFinalUser;
  }
};

export const setMediaUploaded = async (
  groupName: string,
  namespace: string,
  id: string,
  data: MediaFileDetail
): Promise<void> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${namespace}/media?groupName=${encodeURIComponent(groupName)}&fileId=${id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      throw new Error(`Media failed with status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error using media:', error);
    throw error;
  }
};

export const getFileDescription = async (
  namespace: string,
  kind: MediaFileKind,
  url: string,
  id: string,
  file: MediaFileDetail
): Promise<{ data: { content: string }; id: string } | null> => {
  try {
    // Helper function to safely encode Unicode strings to base64
    const unicodeToBase64 = (str: string): string => {
      // First, escape the string to handle Unicode characters
      const utf8Bytes = encodeURIComponent(str);
      // Then convert the escaped string to base64
      const binaryString = utf8Bytes.replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      );
      return btoa(binaryString);
    };

    const encoded64URL = unicodeToBase64(url);
    const encodedPath = unicodeToBase64(file.path || '');

    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${namespace}/media/analyze?url=${encoded64URL}&kind=${kind}&path=${encodedPath}&namespace=${namespace}`,
      {}
    );

    if (!response.ok) {
      throw new Error(`Media failed with status: ${response.status}`);
    }

    return { data: await response.json(), id };
  } catch (error) {
    console.error('Error using media:', error);
    throw error;
  }
};

/** Raw message row from the backend (snake_case DB columns) */
interface RawMessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  type: string;
  content: string | null;
  media_url: string | null;
  reply_id: string | null;
  original_id: string | null;
  channel_thread_id: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: number;
  created_at: string;
}

/** Transform a flat DB row into the frontend Message shape */
function toMessage(row: RawMessageRow): Message {
  return {
    id: row.id,
    timestamp: row.timestamp,
    originalId: row.original_id ?? row.id,
    intent: INTENT.NONE,
    message: { role: row.role, content: row.content ?? '' },
    type: (row.type ?? 'text') as Message['type'],
    mediaUrl: row.media_url,
    replyId: row.reply_id,
  };
}

/** Convert an array of raw rows into a keyed Conversation record */
function toConversation(rows: RawMessageRow[]): Conversation {
  const result: Conversation = {};
  for (const row of rows) {
    result[row.id] = toMessage(row);
  }
  return result;
}

export const getMessagesFromSender = async (
  namespace: string,
  sender: string,
  fromMessageId: string | undefined
): Promise<Conversation | null> => {
  try {
    let url = `${API_BASE_URL}/projects/${namespace}/conversations/${sender}`;
    if (fromMessageId) url += `?from=${fromMessageId}`;
    const response = await authenticatedFetch(url, {});

    if (!response.ok) return null;

    const data: { messages: RawMessageRow[] } = await response.json();
    return toConversation(data.messages ?? []);
  } catch (error) {
    return null;
  }
};

/**
 * Fetch messages from a sender with pagination support
 * @param namespace - Project namespace
 * @param sender - Sender ID (chat ID)
 * @param options - Pagination options
 * @param options.cursorKey - Message ID cursor for fetching older messages
 * @param options.from - Message ID for fetching newer messages (delta sync)
 * @returns Paginated messages response or null on error
 */
export const getMessagesFromSenderPaginated = async (
  namespace: string,
  sender: string,
  options?: { cursorKey?: string; cursorTimestamp?: number; from?: string }
): Promise<{
  messages: Conversation;
  hasMore: boolean;
  nextCursor?: { timestamp: number; key: string };
} | null> => {
  try {
    const params = new URLSearchParams();
    params.set('paginate', 'true');

    if (options?.cursorKey) {
      params.set('cursorKey', options.cursorKey);
    }
    if (options?.cursorTimestamp) {
      params.set('cursorTimestamp', String(options.cursorTimestamp));
    }
    if (options?.from) {
      params.set('from', options.from);
    }

    const url = `${API_BASE_URL}/projects/${namespace}/conversations/${sender}?${params.toString()}`;
    const response = await authenticatedFetch(url, {});

    if (!response.ok) return null;

    const data: {
      messages: RawMessageRow[];
      hasMore: boolean;
      nextCursor?: { timestamp: number; key: string };
    } = await response.json();

    return {
      messages: toConversation(data.messages ?? []),
      hasMore: data.hasMore,
      nextCursor: data.nextCursor,
    };
  } catch (error) {
    return null;
  }
};

export const setChatbotActiveState = async (
  namespace: string,
  sender: string,
  active: boolean,
  nextNode?: string
) => {
  try {
    let url = `${API_BASE_URL}/projects/${namespace}/conversations/${sender}/chatbot?enabled=${active}`;
    if (active && nextNode) {
      url += `&nextNode=${nextNode}`;
    }
    await authenticatedFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return;
  }
};

// Note types
export interface Note {
  noteID: string;
  content: string;
  creator: string;
  timestamp: number;
}

export interface NotesResponse {
  notes: Record<string, Note>;
}

// Create a note for a specific user/chat
export const createNote = async (
  projectName: string,
  userID: string,
  content: string,
  creator: string
): Promise<Note | null> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/conversations/${userID}/notes`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, creator }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create note: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating note:', error);
    return null;
  }
};

// Get all notes for a specific user/chat
export const getNotes = async (projectName: string, userID: string): Promise<Record<string, Note>> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/conversations/${userID}/notes`,
      {}
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch notes: ${response.status}`);
    }

    const data: NotesResponse = await response.json();
    return data.notes || {};
  } catch (error) {
    console.error('Error fetching notes:', error);
    return {};
  }
};

// Delete a note for a specific user/chat
export const deleteNote = async (projectName: string, userID: string, noteID: string): Promise<boolean> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/conversations/${userID}/notes/${noteID}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete note: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting note:', error);
    return false;
  }
};

// Update chat assignee
export const updateChatAssignee = async (
  projectName: string,
  userID: string,
  assignee: string
): Promise<boolean> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/conversations/${userID}/assignee`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ assignee }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update assignee: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error updating assignee:', error);
    return false;
  }
};

export const updateChatStatus = async (
  projectName: string,
  userID: string,
  status: string
): Promise<boolean> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/conversations/${userID}/status`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update status: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error updating status:', error);
    return false;
  }
};

export const sendMessage = async (
  namespace: string,
  to: string,
  msg: string,
  type: 'text' | 'image' | 'audio' | 'pdf',
  id?: string
) => {
  try {
    await authenticatedFetch(`${API_BASE_URL}/messages/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: msg,
        userID: to,
        from: namespace,
        namespace,
        tenantId: namespace,
        agentId: '',
        id,
        type,
      }),
    });
  } catch (error) {
    return;
  }
};

export const fixInquiry = async (namespace: string, to: string, msg: string) => {
  try {
    await authenticatedFetch(`${API_BASE_URL}/messages/inquiry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: msg,
        userID: to,
        namespace,
      }),
    });
  } catch (error) {
    return;
  }
};

export const sendTestMessage = async (
  namespace: string,
  msg: string,
  type: 'text' | 'image' | 'audio' | 'pdf',
  msgId: string
) => {
  try {
    await authenticatedFetch(`${API_BASE_URL}/messages/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: msgId,
        message: msg,
        namespace,
        tenantId: namespace,
        agentId: '',
        type,
      }),
    });
  } catch (error) {
    return;
  }
};

export const deleteConversation = async (namespace: string, from: string) => {
  try {
    await authenticatedFetch(`${API_BASE_URL}/messages/${namespace}/${from}`, {
      method: 'DELETE',
    });
  } catch (error) {
    return;
  }
};

export const sendMediaTestMessage = async (
  namespace: string,
  mediaUrl: string,
  msgId: string,
  type: string,
  caption?: string
) => {
  try {
    const body: Record<string, string> = {
      id: msgId,
      mediaUrl,
      namespace,
      tenantId: namespace,
      agentId: '',
      type,
    };
    if (caption) {
      body.message = caption;
    }
    await authenticatedFetch(`${API_BASE_URL}/messages/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return;
  }
};

export const sendMediaMessage = async (
  namespace: string,
  to: string,
  mediaUrl: string,
  type: 'text' | 'image' | 'audio' | 'pdf' | 'video',
  id: string,
  caption?: string
) => {
  try {
    const body: Record<string, string> = {
      id,
      mediaUrl,
      userID: to,
      from: namespace,
      namespace,
      tenantId: namespace,
      agentId: '',
      type,
    };
    if (caption) {
      body.message = caption;
    }
    await authenticatedFetch(`${API_BASE_URL}/messages/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return;
  }
};

// Cache and request deduplication for last messages
const lastMessagesCache: Map<string, { data: LastMessages; timestamp: number }> = new Map();
const lastMessagesPendingRequests: Map<string, Promise<LastMessages | null>> = new Map();
const LAST_MESSAGES_CACHE_TTL = 60 * 1000; // 1 minute

export const getLastMessages = async (namespace: string): Promise<LastMessages | null> => {
  // 1. Check cache first. This cache is ONLY for DEDUPLICATED, do not think this is
  // for the REAL cached data
  const cached = lastMessagesCache.get(namespace);
  if (cached && Date.now() - cached.timestamp < LAST_MESSAGES_CACHE_TTL) {
    return cached.data;
  }

  // 2. Check if there's already a pending request
  const pendingRequest = lastMessagesPendingRequests.get(namespace);
  if (pendingRequest) {
    return pendingRequest;
  }

  // 3. Create and track the fetch promise
  const fetchPromise = (async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/messages/last`, {});

      if (!response.ok) return null;

      const data: LastMessages = await response.json();

      // Cache the result
      lastMessagesCache.set(namespace, { data, timestamp: Date.now() });

      return data;
    } catch (error) {
      return null;
    } finally {
      lastMessagesPendingRequests.delete(namespace);
    }
  })();

  lastMessagesPendingRequests.set(namespace, fetchPromise);
  return fetchPromise;
};

/**
 * Get paginated last messages for a project using cursor-based pagination
 * @param namespace - Project namespace
 * @param cursor - Optional cursor for pagination (omit for first page)
 * @returns Paginated response with messages, hasMore flag, and nextCursor
 */
export const getLastMessagesPaginated = async (
  namespace: string,
  cursor?: PaginationCursor | null
): Promise<PaginatedLastMessagesResponse | null> => {
  try {
    let url = `${API_BASE_URL}/projects/${namespace}/messages/last?paginate=true`;

    // Add cursor params for subsequent pages
    if (cursor) {
      url += `&cursorTimestamp=${cursor.timestamp}&cursorKey=${cursor.key}`;
    }

    const response = await authenticatedFetch(url, {});

    if (!response.ok) return null;

    const data: PaginatedLastMessagesResponse = await response.json();

    // Ensure each message has key set to the Record key (phone number)
    if (data.messages) {
      for (const [chatId, message] of Object.entries(data.messages)) {
        message.key = chatId;
      }
    }

    return data;
  } catch (error) {
    console.error('[API] getLastMessagesPaginated error:', error);
    return null;
  }
};

/**
 * Get delta (new/updated) last messages since a timestamp
 * @param namespace - Project namespace
 * @param timestamp - Unix timestamp to get changes since
 * @returns Conversations updated since the given timestamp
 */
export const getLastMessagesDelta = async (
  namespace: string,
  timestamp: number
): Promise<DeltaLastMessagesResponse | null> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${namespace}/messages/last/delta?timestamp=${timestamp}`,
      {}
    );

    if (!response.ok) return null;

    const data: DeltaLastMessagesResponse = await response.json();

    // API returns "messages" field but type expects "conversations"
    // Handle both field names for backwards compatibility
    type RawDeltaResponse = {
      messages?: Record<string, LastMessage>;
      conversations?: Record<string, LastMessage>;
    };
    const rawData = data as RawDeltaResponse;
    if (!data.conversations && rawData.messages) {
      data.conversations = rawData.messages;
    }

    // Ensure each message has key set to the Record key (phone number)
    if (data.conversations) {
      for (const [chatId, message] of Object.entries(data.conversations)) {
        message.key = chatId;
      }
    }

    return data;
  } catch (error) {
    console.error('[API] getLastMessagesDelta error:', error);
    return null;
  }
};

/**
 * Get IDs of chats that were deleted since a timestamp
 * @param namespace - Project namespace
 * @param fromTimestamp - Unix timestamp to get deletions since
 * @returns Array of deleted chat IDs and sync timestamp for next call
 */
export const getDeletedChats = async (
  namespace: string,
  fromTimestamp: number
): Promise<DeletedChatsResponse | null> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${namespace}/messages/last/deleted?since=${fromTimestamp}`,
      {}
    );

    if (!response.ok) return null;

    const data: DeletedChatsResponse = await response.json();
    return data;
  } catch (error) {
    console.error('[API] getDeletedChats error:', error);
    return null;
  }
};

export const readConversation = async (namespace: string, phone: string): Promise<void> => {
  try {
    await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/conversations/${phone}/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return;
  }
};

export const getProjectInnerSettings = async (namespace: string): Promise<InnerSettings | null> => {
  try {
    const url = `${API_BASE_URL}/projects/${namespace}/settings`;
    const response = await authenticatedFetch(url, {});
    return await response.json();
  } catch (error) {
    return null;
  }
};

// In-memory cache for project inner settings (short-term deduplication)
const innerSettingsCache: Map<string, { data: InnerSettings; timestamp: number }> = new Map();
// Track in-flight requests to prevent concurrent duplicate fetches
const innerSettingsPendingRequests: Map<string, Promise<InnerSettings | null>> = new Map();
const INNER_SETTINGS_CACHE_TTL = 60 * 1000; // 1 minute TTL for in-memory cache

/**
 * Get project inner settings with caching to prevent duplicate fetches
 * @param namespace - Project namespace
 * @returns InnerSettings or null
 */
export const getProjectInnerSettingsCached = async (namespace: string): Promise<InnerSettings | null> => {
  // Check in-memory cache first
  const cached = innerSettingsCache.get(namespace);
  if (cached && Date.now() - cached.timestamp < INNER_SETTINGS_CACHE_TTL) {
    return cached.data;
  }

  // Check if there's already a pending request for this namespace
  const pendingRequest = innerSettingsPendingRequests.get(namespace);
  if (pendingRequest) {
    return pendingRequest;
  }

  // Create and track the fetch promise
  const fetchPromise = (async () => {
    try {
      const settings = await getProjectInnerSettings(namespace);

      // Cache if data exists
      if (settings) {
        innerSettingsCache.set(namespace, { data: settings, timestamp: Date.now() });
      }

      return settings;
    } finally {
      // Clean up pending request
      innerSettingsPendingRequests.delete(namespace);
    }
  })();

  innerSettingsPendingRequests.set(namespace, fetchPromise);
  return fetchPromise;
};

/**
 * Get project collaborators with optional caching
 * @param namespace - Project namespace
 * @param cache - If true, cache the result for 15 minutes
 * @returns Array of collaborators or null
 */
export const getProjectCollaborators = async (
  namespace: string,
  _cache = false
): Promise<Collaborator[] | null> => {
  try {
    const url = `${API_BASE_URL}/projects/${namespace}/collaborators`;
    const response = await authenticatedFetch(url, {});
    if (!response.ok) return null;
    const data = await response.json();
    return (data as { collaborators: Collaborator[] }).collaborators ?? null;
  } catch {
    return null;
  }
};

// AI Endpoints
export const makeFriendly = async (projectName: string, text: string): Promise<{ text: string }> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${encodeURIComponent(projectName)}/ai/make-friendly`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to make text friendly: ${response.status}`);
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error('[makeFriendly] Error making text friendly:', error);
    throw error;
  }
};

export const makeFormal = async (projectName: string, text: string): Promise<{ text: string }> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${encodeURIComponent(projectName)}/ai/make-formal`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to make text formal: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[makeFormal] Error making text formal:', error);
    throw error;
  }
};

export const fixGrammar = async (projectName: string, text: string): Promise<{ text: string }> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${encodeURIComponent(projectName)}/ai/fix-grammar`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to fix grammar: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[fixGrammar] Error fixing grammar:', error);
    throw error;
  }
};

export const answerQuestion = async (projectName: string, text: string): Promise<{ text: string }> => {
  const response = await authenticatedFetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectName)}/ai/answer-question`,
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Failed to answer question: ${response.status}`);
  }

  const data = await response.json();
  return data;
};
