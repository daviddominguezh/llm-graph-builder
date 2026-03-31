/* eslint-disable @typescript-eslint/no-unused-vars */
import { isPublicEndpoint as checkIsPublicEndpoint } from '@/app/constants/auth';
import { APIError, APIErrorCodes } from '@errors/projects';
import { createCacheService } from '@features/messagesDashboard/core/services/CacheService';
import type {
  DeletedChatsResponse,
  DeltaLastMessagesResponse,
  PaginatedLastMessagesResponse,
  PaginationCursor,
} from '@features/messagesDashboard/core/types';
import { getAuthToken, handleAuthError } from '@services/auth';

import { getApiURL, isLocalDevelopment } from '@/app/utils/environment';
import { getBusinessInfoFromCache, setBusinessInfoToCache } from '@/app/utils/storeDataCache';

import { ChatAuditReport } from '@/app/types/audit';
import { User } from '@/app/types/auth';
import {
  BillingAddress,
  CalculateBillingFeesResponse,
  CreateBillingAddressPayload,
  CreatePaymentMethodPayload,
  GetBillingAddressesResponse,
  GetBillingFeesResponse,
  GetPaymentCardsResponse,
  GetPurchasedCreditsResponse,
} from '@/app/types/billing';
import { Booking, GetBookingResponse } from '@/app/types/bookings';
import {
  BusinessSetupSchema,
  BusinessSetupSchemaAPIType,
  EcommerceBusinessInfoResponse,
  ProductDetailResponse,
  ProductType,
  ProductsListResponse,
  StoreData,
} from '@/app/types/business';
// Shopping Cart API
import { CartAPIResponse, CartItem } from '@/app/types/cart';
import { Conversation, LastMessage, LastMessages, Message } from '@/app/types/chat';
import { CRMAPIResponse } from '@/app/types/crm';
import { FinalUserInfoAPI } from '@/app/types/finalUsers';
import { MediaFileDetail, MediaFileDetailList, MediaFileKind } from '@/app/types/media';
import { Metrics } from '@/app/types/metrics';
import {
  Order,
  OrdersAPIResponse,
  PersonalizationOrderDB,
  PersonalizationOrderDBType,
  StatusType,
} from '@/app/types/orders';
import { PaymentCheckout, PaymentDetail } from '@/app/types/payments';
import { Collaborator, InnerSettings, ScheduleTemplate } from '@/app/types/projectInnerSettings';
import { RAGQueryResults } from '@/app/types/rag';
import { RAGFileStatus } from '@/app/types/ragFiles';
import { RAGRecordDetail, Records } from '@/app/types/records';

const API_BASE_URL = getApiURL();

/**
 * Get authorization headers for protected API endpoints
 * @param url - The full URL being requested
 * @returns Headers object with Authorization and uid headers if needed
 */
const getAuthHeaders = async (url: string): Promise<HeadersInit> => {
  // Check if this is a public endpoint that doesn't need auth
  if (checkIsPublicEndpoint(url)) {
    return {};
  }

  // Get valid token for protected endpoints
  const token = await getAuthToken();

  if (!token) {
    // If we can't get a token, this might indicate auth issues
    console.warn('[API] No auth token available for protected endpoint:', url);
    return {};
  }

  // Get Firebase user to extract UID
  const { getCurrentFirebaseUser } = await import('@services/firebase');
  const firebaseUser = await getCurrentFirebaseUser();

  if (!firebaseUser) {
    console.warn('[API] No Firebase user available for protected endpoint:', url);
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  return {
    Authorization: `Bearer ${token}`,
    uid: firebaseUser.uid,
  };
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

    if (isLocalDevelopment) {
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
      handleAuthError(); // Triggers immediate redirect, no await needed
      throw new Error('Authentication failed');
    }

    return response;
  } catch (error) {
    console.error('[API] Request failed:', error);
    throw error;
  }
};

// Push Notification types
interface PushSubscriptionJSON {
  endpoint?: string;
  expirationTime: number;
  keys?: Record<string, string>;
}

export const getLoginUrl = () => {
  return `${API_BASE_URL}/auth/google`;
};

export const getUserInfo = async (uid: string): Promise<{ user?: User } | null> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/auth/user/${uid}/info`, {
      credentials: 'include',
    });
    return await response.json();
  } catch (error) {
    console.error('Auth getting user failed:', error);
    return null;
  }
};

export const setUserInfo = async (uid: string, user: User): Promise<User | null> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/auth/user/${uid}/info`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(user),
    });
    return await response.json();
  } catch (error) {
    console.error('Auth getting user failed:', error);
    return null;
  }
};

export const updateUserPicture = async (uid: string, pictureURL: string): Promise<User | null> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/auth/user/${uid}/picture`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ picture: pictureURL }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating user picture:', error);
    return null;
  }
};

export const updateUserPictureByEmail = async (email: string, url: string): Promise<void> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/auth/${email}/pic`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) {
      throw new Error('Failed to update user picture by email');
    }
  } catch (error) {
    console.error('Error updating user picture by email:', error);
    throw error;
  }
};

export const getUserPictureByEmail = async (email: string): Promise<string | null> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/auth/${email}/pic`, {
      method: 'GET',
      credentials: 'include',
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

export const getFinalUserInfo = async (namespace: string, id: string): Promise<FinalUserInfoAPI> => {
  const emptyFinalUser = {
    name: undefined,
    city: undefined,
    gender: undefined,
  };
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/users/${id}`, {
      method: 'GET',
      credentials: 'include',
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

export const checkPhoneInDB = async (phone: string): Promise<boolean | null> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/auth/phone/${phone}`, {
      credentials: 'include',
    });
    const data: { exists: boolean } = await response.json();
    return data.exists;
  } catch (_e) {
    return null;
  }
};

export const fetchProjects = async (email: string): Promise<{ projects: Record<string, string> }> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/${email}`, {
      credentials: 'include',
    });

    if (!response.ok) throw new Error('Failed to fetch projects');

    return await response.json();
  } catch (error) {
    console.error('Error fetching projects:', error);
    throw error;
  }
};

export interface CreateProjectResponse {
  projectId: string;
  batchWorkloadID?: string;
}

export const createProject = async (
  email: string,
  projectName: string,
  projectDescription: string,
  userName: string,
  businessSetup: Partial<BusinessSetupSchemaAPIType>,
  isTest: boolean = false
): Promise<CreateProjectResponse> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/${email}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectName, projectDescription, userName, isTest, businessSetup }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      let error: APIError;
      if (errorData.code === 'name_taken')
        error = new APIError({ code: APIErrorCodes.NAME_TAKEN, message: 'Failed to create project' });
      else error = new APIError({ code: APIErrorCodes.DEFAULT, message: 'Failed to create project' });
      throw error;
    }

    const data = await response.json();
    return { projectId: data.projectId, batchWorkloadID: data.batchWorkloadID };
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  }
};

export const synchBatch = async (requestData: {
  fileIds: string[];
  webhookFiles: string[];
  folderIds: string[];
  namespace: string;
  fileNames: Record<string, string>;
}) => {
  const response = await authenticatedFetch(`${API_BASE_URL}/projects/${requestData.namespace}/drive/sync`, {
    method: 'POST',
    body: JSON.stringify(requestData),
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/html',
    },
  });

  if (!response.ok) {
    console.error('Export failed with status:', response.status);
    throw new Error(`Export failed with status: ${response.status}`);
  }
};

export const fetchRecords = async (namespace: string): Promise<{ records: Records }> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/records`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch records');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching records:', error);
    throw error;
  }
};

export const fetchRecordDetails = async (namespace: string, fileId: string): Promise<RAGRecordDetail> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/records/${fileId}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch record details');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching record details:', error);
    throw error;
  }
};

export const searchRecords = async (
  namespace: string,
  query: string,
  topk: number,
  minScore: number
): Promise<RAGQueryResults> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${namespace}/records/search?topk=${topk}&min=${minScore}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Search failed with status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error searching records:', error);
    throw error;
  }
};

export const fetchFilesStatus = async (
  namespace: string
): Promise<{ files: Record<string, RAGFileStatus> }> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/records/status`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`API failed with status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error using api:', error);
    throw error;
  }
};

export const sendMessages = async (
  namespace: string,
  query = false,
  messages: Message[]
): Promise<Message> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${namespace}/assistant?query_rag=${query}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Assistant failed with status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error using assistant:', error);
    throw error;
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
        credentials: 'include',
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

export const getMediaUploaded = async (
  groupName: string,
  namespace: string
): Promise<MediaFileDetailList | null> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/media/${groupName}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Media failed with status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error using media:', error);
    throw error;
  }
};

export const updateMediaFolder = async (
  mediaId: string,
  folder: string | null,
  groupName: string,
  namespace: string
): Promise<boolean> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${namespace}/media/${groupName}/${mediaId}/folder`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ folder }),
      }
    );

    if (!response.ok) {
      throw new Error(`Update media folder failed with status: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error updating media folder:', error);
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
      {
        credentials: 'include',
      }
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

export const getBusinessInfo = async (
  namespace: string,
  options?: { skipAuth?: boolean }
): Promise<BusinessSetupSchemaAPIType | null> => {
  try {
    const url = `${API_BASE_URL}/projects/${namespace}/business`;

    // Use plain fetch for public ecommerce access, authenticatedFetch for admin
    const response = options?.skipAuth
      ? await fetch(url, { credentials: 'include' })
      : await authenticatedFetch(url, { credentials: 'include' });

    if (!response.ok) return null;

    return await response.json();
  } catch (error) {
    return null;
  }
};

/**
 * Wrapper around getBusinessInfo that adds caching with 1-day TTL
 * Uses IndexedDB for large data storage (avoids localStorage quota issues)
 * @param namespace - The project namespace
 * @param cache - Whether to use cache (default: true)
 * @returns Business info or null
 */
export const getBusinessInfoCached = async (
  namespace: string,
  cache = true
): Promise<BusinessSetupSchemaAPIType | null> => {
  // Try cache first
  if (cache) {
    const cached = await getBusinessInfoFromCache(namespace);
    if (cached) {
      return cached;
    }
  }

  // Fetch from API using existing function
  const businessInfo = await getBusinessInfo(namespace);

  // Cache if enabled and data exists
  if (cache && businessInfo) {
    await setBusinessInfoToCache(namespace, businessInfo);
  }

  return businessInfo;
};

export const getCalendarDataByYear = async (namespace: string, year: string): Promise<Booking[] | null> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${namespace}/booking/bookingsByYear/${year}`,
      {
        credentials: 'include',
      }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as GetBookingResponse;
    if (data.type === 'error') return null;
    return data.data;
  } catch (error) {
    return null;
  }
};

export const setBusinessInfo = async (
  namespace: string,
  data: typeof BusinessSetupSchema
): Promise<{ data: { content: string }; id: string } | null> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/business`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Setup failed with status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error using media:', error);
    throw error;
  }
};

export const getMessagesFromSender = async (
  namespace: string,
  sender: string,
  fromMessageId: string | undefined
): Promise<Conversation | null> => {
  try {
    let url = `${API_BASE_URL}/projects/${namespace}/messages/${sender}`;
    if (fromMessageId) url += `?from=${fromMessageId}`;
    const response = await authenticatedFetch(url, {
      credentials: 'include',
    });

    if (!response.ok) return null;

    return await response.json();
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

    const url = `${API_BASE_URL}/projects/${namespace}/messages/${sender}?${params.toString()}`;
    const response = await authenticatedFetch(url, {
      credentials: 'include',
    });

    if (!response.ok) return null;

    return await response.json();
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
    let url = `${API_BASE_URL}/projects/${namespace}/messages/${sender}/active?enabled=${active}`;
    if (active && nextNode) {
      url += `&nextNode=${nextNode}`;
    }
    await authenticatedFetch(url, {
      credentials: 'include',
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
      `${API_BASE_URL}/projects/${projectName}/messages/notes/${userID}`,
      {
        method: 'POST',
        credentials: 'include',
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
      `${API_BASE_URL}/projects/${projectName}/messages/notes/${userID}`,
      {
        credentials: 'include',
      }
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
      `${API_BASE_URL}/projects/${projectName}/messages/notes/${userID}/${noteID}`,
      {
        method: 'DELETE',
        credentials: 'include',
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

// Activity types
export interface ChatActivity {
  timestamp: number;
  activity: string;
}

export interface ChatActivityAPI {
  activity: Record<string, ChatActivity>;
}

// Get activity for a specific user/chat
export const getActivity = async (
  projectName: string,
  userID: string
): Promise<Record<string, ChatActivity>> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/messages/activity/${userID}`,
      {
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch activity: ${response.status}`);
    }

    const data: ChatActivityAPI = await response.json();
    return data.activity || {};
  } catch (error) {
    console.error('Error fetching activity:', error);
    return {};
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
      `${API_BASE_URL}/projects/${projectName}/messages/assignee/${userID}`,
      {
        method: 'POST',
        credentials: 'include',
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
      `${API_BASE_URL}/projects/${projectName}/messages/status/${userID}`,
      {
        method: 'POST',
        credentials: 'include',
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

// Tags API
export interface Tag {
  tagID: string;
  tag: string;
  description: string;
}

export interface TagsResponse {
  tags: Record<string, Tag>;
}

// Cache and request deduplication for tags
const tagsCache: Map<string, { data: Record<string, Tag>; timestamp: number }> = new Map();
const tagsPendingRequests: Map<string, Promise<Record<string, Tag>>> = new Map();
const TAGS_CACHE_TTL = 60 * 1000; // 1 minute

export const getTags = async (projectName: string): Promise<Record<string, Tag>> => {
  // 1. Check cache first
  const cached = tagsCache.get(projectName);
  if (cached && Date.now() - cached.timestamp < TAGS_CACHE_TTL) {
    return cached.data;
  }

  // 2. Check if there's already a pending request
  const pendingRequest = tagsPendingRequests.get(projectName);
  if (pendingRequest) {
    return pendingRequest;
  }

  // 3. Create and track the fetch promise
  const fetchPromise = (async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/projects/${projectName}/messages/tags`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch tags: ${response.status}`);
      }

      const data: TagsResponse = await response.json();
      const tags = data.tags || {};

      // Cache the result
      tagsCache.set(projectName, { data: tags, timestamp: Date.now() });

      return tags;
    } catch (error) {
      console.error('Error fetching tags:', error);
      return {};
    } finally {
      tagsPendingRequests.delete(projectName);
    }
  })();

  tagsPendingRequests.set(projectName, fetchPromise);
  return fetchPromise;
};

export const createTag = async (projectName: string, tag: string, description: string): Promise<boolean> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/${projectName}/messages/tags`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tag, description }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create tag: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error creating tag:', error);
    return false;
  }
};

export const deleteTag = async (projectName: string, tagID: string): Promise<boolean> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/messages/tags/${tagID}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete tag: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting tag:', error);
    return false;
  }
};

export const setChatTags = async (projectName: string, userID: string, tags: string[]): Promise<boolean> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/messages/tags/${userID}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tags }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to set chat tags: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error setting chat tags:', error);
    return false;
  }
};

// Quick Replies API
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

export interface CreateQuickReplyResponse {
  status: 'ok';
  quickReplyID: string;
}

// Cache and request deduplication for quick replies
const quickRepliesCache: Map<string, { data: Record<string, QuickReply>; timestamp: number }> = new Map();
const quickRepliesPendingRequests: Map<string, Promise<Record<string, QuickReply>>> = new Map();
const QUICK_REPLIES_CACHE_TTL = 60 * 1000; // 1 minute

export const getQuickReplies = async (projectName: string): Promise<Record<string, QuickReply>> => {
  // 1. Check cache first
  const cached = quickRepliesCache.get(projectName);
  if (cached && Date.now() - cached.timestamp < QUICK_REPLIES_CACHE_TTL) {
    return cached.data;
  }

  // 2. Check if there's already a pending request
  const pendingRequest = quickRepliesPendingRequests.get(projectName);
  if (pendingRequest) {
    return pendingRequest;
  }

  // 3. Create and track the fetch promise
  const fetchPromise = (async () => {
    try {
      const response = await authenticatedFetch(
        `${API_BASE_URL}/projects/${projectName}/messages/quickReplies`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch quick replies: ${response.status}`);
      }

      const data: QuickRepliesResponse = await response.json();
      const quickReplies = data.quickReplies || {};

      // Cache the result
      quickRepliesCache.set(projectName, { data: quickReplies, timestamp: Date.now() });

      return quickReplies;
    } catch (error) {
      console.error('Error fetching quick replies:', error);
      return {};
    } finally {
      quickRepliesPendingRequests.delete(projectName);
    }
  })();

  quickRepliesPendingRequests.set(projectName, fetchPromise);
  return fetchPromise;
};

export const createQuickReply = async (
  projectName: string,
  title: string,
  text: string,
  category: string,
  shortcut?: string,
  description?: string
): Promise<CreateQuickReplyResponse | null> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/messages/quickReplies`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          text,
          category,
          shortcut: shortcut || undefined,
          description: description || undefined,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create quick reply: ${response.status}`);
    }

    const data: CreateQuickReplyResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating quick reply:', error);
    return null;
  }
};

export const deleteQuickReply = async (projectName: string, quickReplyID: string): Promise<boolean> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/messages/quickReplies/${quickReplyID}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete quick reply: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting quick reply:', error);
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
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: msg,
        userID: to,
        from: namespace,
        namespace,
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
      credentials: 'include',
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
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: msgId,
        message: msg,
        namespace,
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
      credentials: 'include',
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
      type,
    };
    if (caption) {
      body.message = caption;
    }
    await authenticatedFetch(`${API_BASE_URL}/messages/test`, {
      credentials: 'include',
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
      type,
    };
    if (caption) {
      body.message = caption;
    }
    await authenticatedFetch(`${API_BASE_URL}/messages/message`, {
      credentials: 'include',
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
      const response = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/messages/last`, {
        credentials: 'include',
      });

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

    const response = await authenticatedFetch(url, {
      credentials: 'include',
    });

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
      `${API_BASE_URL}/projects/${namespace}/messages/last?timestamp=${timestamp}`,
      {
        credentials: 'include',
      }
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
      `${API_BASE_URL}/projects/${namespace}/messages/deletedChats?from=${fromTimestamp}`,
      {
        credentials: 'include',
      }
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
    await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/messages/read/${phone}`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return;
  }
};

export const addTrackingInfoToOrder = async (
  namespace: string,
  orderId: string,
  trackingId: string,
  trackingReceipt?: string | null
) => {
  try {
    const track: { trackingId: string; trackingReceipt?: string | null } = {
      trackingId,
    };
    if (trackingReceipt) track.trackingReceipt = trackingReceipt;
    await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/orders/${orderId}/tracking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(track),
    });
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    throw error;
  }
};

export const updateOrderStatus = async (namespace: string, orderId: string, status: StatusType) => {
  try {
    await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/orders/${orderId}`, {
      credentials: 'include',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
  } catch (error) {
    return;
  }
};

// TODO: Must change
export const createOrder = async (namespace: string, orderData: Order) => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(orderData),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('API Error Response:', errorText);
      throw new Error(`Failed to create order: ${res.status} - ${errorText}`);
    }

    return await res.json();
  } catch (error) {
    console.error('Error creating order:', error);
    throw error;
  }
};

// TODO: Must change
export const getOrders = async (namespace: string): Promise<OrdersAPIResponse | null> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/orders`);
    return await res.json();
  } catch (error) {
    const e = error as Error;
    console.error(e);
    return null;
  }
};

// CRM API
const CRM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

interface CRMCache {
  data: CRMAPIResponse;
  timestamp: number;
}

const getCRMCacheKey = (namespace: string): string => `crm_cache_${namespace}`;

const getCachedCRM = (namespace: string): CRMAPIResponse | null => {
  try {
    const cached = localStorage.getItem(getCRMCacheKey(namespace));
    if (!cached) return null;

    const { data, timestamp }: CRMCache = JSON.parse(cached);
    const isExpired = Date.now() - timestamp > CRM_CACHE_TTL;

    if (isExpired) {
      localStorage.removeItem(getCRMCacheKey(namespace));
      return null;
    }

    return data;
  } catch {
    return null;
  }
};

const setCRMCache = (namespace: string, data: CRMAPIResponse): void => {
  try {
    const cache: CRMCache = { data, timestamp: Date.now() };
    localStorage.setItem(getCRMCacheKey(namespace), JSON.stringify(cache));
  } catch {
    // Ignore localStorage errors (e.g., quota exceeded)
  }
};

export const getCRM = async (namespace: string): Promise<CRMAPIResponse | null> => {
  // Check cache first
  const cached = getCachedCRM(namespace);
  if (cached) {
    return cached;
  }

  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/crm`);
    const data = await res.json();
    setCRMCache(namespace, data);
    return data;
  } catch (error) {
    console.error('Error fetching CRM data:', error);
    return null;
  }
};

export interface UserOrdersAPIResponse {
  orders: Order[];
  count: number;
}

export const getUserOrders = async (projectName: string, userID: string): Promise<UserOrdersAPIResponse> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/projects/${projectName}/orders/user/${userID}`, {
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch user orders: ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.error('Error fetching user orders:', error);
    throw error;
  }
};

export interface OrderReceiptResponse {
  orderId: string;
  receipt: string;
}

export const getOrderReceipt = async (
  projectName: string,
  trackingReceiptId: string
): Promise<OrderReceiptResponse | null> => {
  try {
    const res = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/orders/${trackingReceiptId}/receipt`,
      {
        credentials: 'include',
      }
    );

    if (!res.ok) {
      // If receipt doesn't exist, return null instead of throwing
      if (res.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch order receipt: ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.error('Error fetching order receipt:', error);
    return null;
  }
};

export const getPaymentIntegrationStatus = async (namespace: string): Promise<boolean> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/payments/integration-status/${namespace}`);
    const json = await res.json();
    return json.integrated || false;
  } catch (error) {
    const e = error as Error;
    console.error(e);
    return false;
  }
};

export const getMercadoPagoRedirectURL = async (namespace: string): Promise<string> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/payments/redirect/${namespace}`);
    const json = await res.json();
    return json.url;
  } catch (error) {
    const e = error as Error;
    console.error(e);
    throw e;
  }
};

export const getWhatsAppIntegrationStatus = async (namespace: string): Promise<boolean> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/whatsapp/integration-status/${namespace}`);
    const json = await res.json();
    return json.integrated || false;
  } catch (error) {
    const e = error as Error;
    console.error(e);
    return false;
  }
};

export const getWhatsAppRedirectURL = async (namespace: string): Promise<string> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/whatsapp/redirect/${namespace}`);
    const json = await res.json();
    return json.url;
  } catch (error) {
    const e = error as Error;
    console.error(e);
    throw e;
  }
};

export interface ProjectIntegrations {
  mercadopago: {
    integrated: boolean;
    redirectUrl?: string;
  };
  whatsapp: {
    integrated: boolean;
    redirectUrl?: string;
    data?: string; // Phone number when integrated
  };
  shopify: {
    integrated: boolean;
    shop?: string; // Store domain when integrated
  };
  instagram: {
    integrated: boolean;
    username?: string; // Instagram username when integrated
    status?: 'syncing' | 'completed'; // Sync status
    progress?: string; // Progress string like "1/20"
  };
}

export const getProjectIntegrations = async (projectName: string): Promise<ProjectIntegrations | null> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/projects/${projectName}/integrations`);
    if (!res.ok) {
      throw new Error(`Failed to fetch integrations: ${res.statusText}`);
    }
    const json = await res.json();
    return json;
  } catch (error) {
    const e = error as Error;
    console.error(e);
    return null;
  }
};

export const connectWhatsAppIntegration = async (
  projectName: string,
  phone: string,
  phoneNumberId: string,
  waba: string,
  authCode: string
): Promise<WhatsAppIntegrationResponse> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${projectName}/integrations/whatsapp`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone, phoneNumberId, waba, authCode }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      const message = errorData.error || 'Failed to connect WhatsApp';
      throw new Error(message);
    }

    return await response.json();
  } catch (error) {
    console.error('Error connecting WhatsApp integration:', error);
    throw error;
  }
};

export const getShopifyOAuthUrl = async (
  namespace: string,
  shop: string,
  clientId: string,
  clientSecret: string
): Promise<string> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/shopify/url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ namespace, shop, clientId, clientSecret }),
    });
    if (!res.ok) {
      throw new Error(`Failed to get Shopify OAuth URL: ${res.statusText}`);
    }
    const json = await res.json();
    return json.url;
  } catch (error) {
    const e = error as Error;
    console.error('Error getting Shopify OAuth URL:', e);
    throw e;
  }
};

// Scrape response types
export interface ScrapedPersonalizationValue {
  value: string;
  addedPrice: number;
}

export interface ScrapedPersonalization {
  type: string;
  emoji: string;
  values: ScrapedPersonalizationValue[];
}

export interface ScrapedCategory {
  id: string;
  name: string;
  isHeader?: boolean;
}

export interface ShopifyScrapeResponse {
  products: ProductType[];
  personalizations: ScrapedPersonalization[];
  categories: ScrapedCategory[];
}

// Scrape Shopify products from a public URL (no admin rights needed)
export const scrapeShopifyProducts = async (url: string): Promise<ShopifyScrapeResponse> => {
  const res = await authenticatedFetch(`${API_BASE_URL}/shopify/scrape`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    throw new Error(`Failed to scrape Shopify products: ${res.statusText}`);
  }
  const data = await res.json();
  return {
    products: data.products || [],
    personalizations: data.personalizations || [],
    categories: data.categories || [],
  };
};

// Import Shopify products via admin API (requires Shopify integration/admin rights)
export const importShopifyProducts = async (namespace: string): Promise<void> => {
  const res = await authenticatedFetch(
    `${API_BASE_URL}/shopify/import-products/${encodeURIComponent(namespace)}`,
    {
      method: 'POST',
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to import Shopify products: ${res.statusText}`);
  }
};

export const importShopifyOrders = async (namespace: string): Promise<void> => {
  const res = await authenticatedFetch(
    `${API_BASE_URL}/shopify/import-orders/${encodeURIComponent(namespace)}`,
    {
      method: 'POST',
    }
  );
  if (!res.ok) {
    throw new Error(`Failed to import Shopify orders: ${res.statusText}`);
  }
};

export interface ScrapedWebsiteResponse {
  description: string;
  website: string;
  storeManager: 'shopify' | 'vtex' | 'unknown';
  guaranteePolicy?: string;
  returnsPolicy?: string;
  shippingPolicy?: string;
}

export const scrapeWebsite = async (url: string): Promise<ScrapedWebsiteResponse | null> => {
  try {
    const encodedUrl = encodeURIComponent(url);
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/scrap?url=${encodedUrl}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      console.error(`Scraping failed with status: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error scraping website:', error);
    return null;
  }
};

export const validatePayment = async (key: string): Promise<void> => {
  try {
    await authenticatedFetch(`${API_BASE_URL}/payments/validate-pending/${key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    const e = error as Error;
    console.error(e);
    throw e;
  }
};

// TODO: Must change - maybe, double check
export const getCheckout = async (key: string): Promise<PaymentCheckout | null> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/payments/checkout/${key}`);
    const json = await res.json();
    if ('error' in json) return null;
    return json as PaymentCheckout;
  } catch (error) {
    const e = error as Error;
    console.error(e);
    throw e;
  }
};

// TODO: Must change - maybe, double check
export const getPaymentDetail = async (key: string): Promise<PaymentDetail | null> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/payments/detail?key=${key}`);
    const json = await res.json();
    if ('error' in json) return null;
    return json as PaymentDetail;
  } catch (error) {
    const e = error as Error;
    console.error(e);
    throw e;
  }
};

export const pay = async (key: string, body: string): Promise<unknown> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/payments/test?key=${key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });
    const json = await res.json();
    return json;
  } catch (error) {
    const e = error as Error;
    console.error(e);
    throw e;
  }
};

// Push Notifications API
export const subscribeToPushNotifications = async (subscriptionData: {
  subscription: PushSubscriptionJSON;
  projectName: string;
  userAgent: string;
  timestamp: number;
  vapidKeyUsed: string;
}): Promise<{ success: boolean; message?: string; subscriptionId?: string }> => {
  try {
    // Validate required subscription fields
    if (!subscriptionData.subscription.endpoint) {
      throw new Error('Push subscription endpoint is required');
    }
    if (!subscriptionData.subscription.keys) {
      throw new Error('Push subscription keys are required');
    }
    if (!subscriptionData.subscription.keys.p256dh || !subscriptionData.subscription.keys.auth) {
      throw new Error('Push subscription keys must include p256dh and auth');
    }

    const response = await authenticatedFetch(`${API_BASE_URL}/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(subscriptionData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Push subscription failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    throw error;
  }
};

export const unsubscribeFromPushNotifications = async (subscriptionData: {
  endpoint: string;
  timestamp: number;
}): Promise<{ success: boolean; message?: string }> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/push/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(subscriptionData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Push unsubscription failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    throw error;
  }
};

export const getStoreData = async (key: string): Promise<StoreData | null> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/stores/${key}`);
    const json = await res.json();
    if ('error' in json) return null;
    return json as StoreData;
  } catch (error) {
    const e = error as Error;
    console.error(e);
    return null;
  }
};

// Ecommerce API functions
export const getProductsList = async (
  namespace: string,
  page: number = 1,
  category?: string
): Promise<ProductsListResponse | null> => {
  try {
    const params = new URLSearchParams({ page: String(page) });
    if (category) {
      params.append('category', category);
    }
    const url = `${API_BASE_URL}/projects/${namespace}/products?${params.toString()}`;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error getting products list:', error);
    return null;
  }
};

export const getProductById = async (
  namespace: string,
  productId: string
): Promise<ProductDetailResponse | null> => {
  try {
    const url = `${API_BASE_URL}/projects/${namespace}/products/${productId}`;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error getting product:', error);
    return null;
  }
};

export const getEcommerceBusinessInfo = async (
  namespace: string
): Promise<EcommerceBusinessInfoResponse | null> => {
  try {
    const url = `${API_BASE_URL}/projects/${namespace}/products/business-info`;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error getting ecommerce business info:', error);
    return null;
  }
};

export const getOrderPersonalization = async (key: string): Promise<PersonalizationOrderDBType | null> => {
  try {
    const res = await authenticatedFetch(`${API_BASE_URL}/order-personalizations/${key}`);
    const json = await res.json();
    if ('error' in json) return null;
    return json as PersonalizationOrderDBType;
  } catch (error) {
    const e = error as Error;
    console.error(e);
    return null;
  }
};

export const setOrderPersonalization = async (
  key: string,
  items: PersonalizationOrderDB,
  markAsCompleted: boolean = true
): Promise<void> => {
  try {
    const mItems = JSON.parse(JSON.stringify(items)) as PersonalizationOrderDB;
    mItems.forEach((item) => {
      const reg = new RegExp(/-variant-(\d)*$/);
      if (reg.test(item.id)) {
        const lastIndex = item.id.lastIndexOf('-variant-');
        item.id = item.id.substring(0, lastIndex);
      }
    });

    await authenticatedFetch(`${API_BASE_URL}/order-personalizations/${key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        items: mItems,
        ready: markAsCompleted,
      }),
    });
  } catch (error) {
    const e = error as Error;
    console.error(e);
  }
};

export const getMetrics = async (namespace: string): Promise<Metrics | null> => {
  try {
    const url = `${API_BASE_URL}/projects/${namespace}/metrics`;
    const response = await authenticatedFetch(url, {
      credentials: 'include',
    });
    return await response.json();
  } catch (error) {
    return null;
  }
};

export const getProjectInnerSettings = async (namespace: string): Promise<InnerSettings | null> => {
  try {
    const url = `${API_BASE_URL}/projects/${namespace}/settings`;
    const response = await authenticatedFetch(url, {
      credentials: 'include',
    });
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
  cache = false
): Promise<Collaborator[] | null> => {
  const cacheService = createCacheService('localStorage');
  const cacheKey = `collaborators-${namespace}`;

  // Try to get from cache if caching is enabled
  if (cache) {
    const cached = await cacheService.get('collaborators', namespace);
    if (cached && cached.data) {
      return cached.data as Collaborator[];
    }
  }

  // Fetch from API (using cached version to prevent duplicate fetches)
  try {
    const settings = await getProjectInnerSettingsCached(namespace);
    const collaborators = settings?.collaborators || null;

    // Cache if enabled and data exists
    if (cache && collaborators) {
      const TTL = 15 * 60 * 1000; // 15 minutes
      await cacheService.set('collaborators', namespace, collaborators, TTL);
    }

    return collaborators;
  } catch (error) {
    return null;
  }
};

export const setProjectInnerSettings = async (
  namespace: string,
  data: Partial<InnerSettings>
): Promise<void> => {
  try {
    await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });
  } catch (error) {
    const e = error as Error;
    console.error(e);
  }
};

// Schedule Template API
export const getScheduleTemplates = async (namespace: string): Promise<ScheduleTemplate[]> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/schedule-templates`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch schedule templates');
    }

    const data = await response.json();
    const templates = data.schedules || [];

    // Normalize templates to ensure all array fields exist
    return templates.map((template: ScheduleTemplate) => ({
      ...template,
      weekdaySchedules: {
        monday: template.weekdaySchedules?.monday || [],
        tuesday: template.weekdaySchedules?.tuesday || [],
        wednesday: template.weekdaySchedules?.wednesday || [],
        thursday: template.weekdaySchedules?.thursday || [],
        friday: template.weekdaySchedules?.friday || [],
        saturday: template.weekdaySchedules?.saturday || [],
        sunday: template.weekdaySchedules?.sunday || [],
      },
      holidaySchedules: template.holidaySchedules || [],
    }));
  } catch (error) {
    const e = error as Error;
    console.error(e);
    return [];
  }
};

export const saveScheduleTemplate = async (namespace: string, template: ScheduleTemplate): Promise<void> => {
  try {
    await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/schedule-templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(template),
    });
  } catch (error) {
    const e = error as Error;
    console.error(e);
    throw error;
  }
};

export const deleteScheduleTemplate = async (namespace: string, templateId: string): Promise<void> => {
  try {
    await authenticatedFetch(`${API_BASE_URL}/projects/${namespace}/schedule-templates/${templateId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
  } catch (error) {
    const e = error as Error;
    console.error(e);
    throw error;
  }
};

// Billing Address API
export const createBillingAddress = async (
  email: string,
  data: CreateBillingAddressPayload
): Promise<BillingAddress> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/billing/${encodeURIComponent(email)}/clients`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create billing address: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating billing address:', error);
    throw error;
  }
};

export const getBillingAddresses = async (email: string): Promise<GetBillingAddressesResponse> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/billing/${encodeURIComponent(email)}/clients`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch billing addresses: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching billing addresses:', error);
    throw error;
  }
};

export const deleteBillingAddress = async (email: string, addressId: string): Promise<void> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/billing/${encodeURIComponent(email)}/clients/${encodeURIComponent(addressId)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete billing address: ${response.status}`);
    }
  } catch (error) {
    console.error('Error deleting billing address:', error);
    throw error;
  }
};

export const getPaymentCards = async (email: string): Promise<GetPaymentCardsResponse> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/billing/${encodeURIComponent(email)}/cards`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch payment cards: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching payment cards:', error);
    throw error;
  }
};

// Creates a payment method using MercadoPago card token
// This endpoint saves the tokenized card data on the backend
export const createPaymentMethod = async (email: string, data: CreatePaymentMethodPayload): Promise<void> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/billing/${encodeURIComponent(email)}/cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Failed to create payment method: ${response.status}`);
    }
  } catch (error) {
    console.error('Error creating payment method:', error);
    throw error;
  }
};

export const deletePaymentCard = async (email: string, cardId: string): Promise<void> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/billing/${encodeURIComponent(email)}/cards/${encodeURIComponent(cardId)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete payment card: ${response.status}`);
    }
  } catch (error) {
    console.error('Error deleting payment card:', error);
    throw error;
  }
};

export const payWithCard = async (
  email: string,
  cardId: string,
  payload: {
    type: string;
    amount: number;
    token: string;
    namespace: string;
    deviceId?: string;
    discountCode?: string;
  }
): Promise<{ status?: string; error?: string }> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/billing/${encodeURIComponent(email)}/cards/${encodeURIComponent(cardId)}/pay`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error processing payment:', error);
    throw error;
  }
};

export const getPayments = async (
  namespace: string
): Promise<{
  payments: Array<{
    amount: number;
    discountCode?: string;
    status: string;
    timestamp: number;
    totalAmount: number;
    type: string;
  }>;
}> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/billing/${encodeURIComponent(namespace)}/payments`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch payments: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching payments:', error);
    throw error;
  }
};

export const getBillingFees = async (namespace: string): Promise<GetBillingFeesResponse> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/billing/${encodeURIComponent(namespace)}/fees`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch billing fees: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching billing fees:', error);
    throw error;
  }
};

export const calculateBillingFees = async (
  namespace: string,
  credits: number,
  discountCode?: string
): Promise<CalculateBillingFeesResponse> => {
  try {
    const params = new URLSearchParams({ credits: credits.toString() });
    if (discountCode && discountCode.trim()) {
      params.append('discountCode', discountCode.trim());
    }

    const response = await authenticatedFetch(
      `${API_BASE_URL}/billing/${encodeURIComponent(namespace)}/fees/calculator?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to calculate billing fees: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error calculating billing fees:', error);
    throw error;
  }
};

export const getPurchasedCredits = async (namespace: string): Promise<GetPurchasedCreditsResponse> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/billing/${encodeURIComponent(namespace)}/purchased-credits`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch purchased credits: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching purchased credits:', error);
    throw error;
  }
};

export const getShoppingCart = async (projectName: string, userID: string): Promise<CartAPIResponse> => {
  const url = `${API_BASE_URL}/projects/${encodeURIComponent(projectName)}/shopping-cart/${encodeURIComponent(userID)}`;

  try {
    const response = await authenticatedFetch(url, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch shopping cart: ${response.status}`);
    }

    const rawData = await response.json();

    // Check if backend is using old format with { items: [], ready: boolean } or { ready: boolean }
    const isOldFormat =
      rawData.cart &&
      (Array.isArray(rawData.cart.items) ||
        (typeof rawData.cart.ready === 'boolean' && Object.keys(rawData.cart).length <= 2));

    if (isOldFormat) {
      // Transform old format to new format: convert array to object
      const cartObject: Record<string, CartItem> = {};

      // Only process items if they exist
      if (Array.isArray(rawData.cart.items)) {
        rawData.cart.items.forEach((item: CartItem) => {
          // Create a unique key that includes personalizations to support
          // multiple items with same product ID but different personalizations
          let uniqueKey = item.id;
          if (item.personalizations && item.personalizations.length > 0) {
            const personalizationKey = item.personalizations
              .map((p) => `${p.type}:${p.value}`)
              .sort()
              .join('|');
            uniqueKey = `${item.id}::${personalizationKey}`;
          }
          cartObject[uniqueKey] = item;
        });
      }

      const transformedData: CartAPIResponse = {
        cart: cartObject,
      };

      return transformedData;
    }

    // New format - use as-is, but filter out non-CartItem entries (like 'ready')
    const data: CartAPIResponse = rawData;

    // Filter out any properties that are not valid CartItems
    const filteredCart: Record<string, CartItem> = {};
    if (data.cart && typeof data.cart === 'object') {
      Object.keys(data.cart).forEach((key) => {
        const item = data.cart[key];
        // Check if it's a valid CartItem (has id, quantity properties)
        if (item && typeof item === 'object' && 'id' in item && 'quantity' in item) {
          filteredCart[key] = item;
        }
      });
    }

    const filteredData: CartAPIResponse = { cart: filteredCart };
    return filteredData;
  } catch (error) {
    console.error('[getShoppingCart] Error fetching shopping cart:', error);
    throw error;
  }
};

export const addToShoppingCart = async (
  projectName: string,
  userID: string,
  item: CartItem
): Promise<CartAPIResponse> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${encodeURIComponent(projectName)}/shopping-cart/${encodeURIComponent(userID)}/items`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(item),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to add item to cart: ${response.status}`);
    }

    const rawData = await response.json();

    // Check if backend is using old format with { items: [], ready: boolean } or { ready: boolean }
    const isOldFormat =
      rawData.cart &&
      (Array.isArray(rawData.cart.items) ||
        (typeof rawData.cart.ready === 'boolean' && Object.keys(rawData.cart).length <= 2));

    if (isOldFormat) {
      const cartObject: Record<string, CartItem> = {};

      // Only process items if they exist
      if (Array.isArray(rawData.cart.items)) {
        rawData.cart.items.forEach((cartItem: CartItem) => {
          cartObject[cartItem.id] = cartItem;
        });
      }
      return { cart: cartObject };
    }

    // New format - filter out non-CartItem entries
    const data: CartAPIResponse = rawData;
    const filteredCart: Record<string, CartItem> = {};
    if (data.cart && typeof data.cart === 'object') {
      Object.keys(data.cart).forEach((key) => {
        const item = data.cart[key];
        if (item && typeof item === 'object' && 'id' in item && 'quantity' in item) {
          filteredCart[key] = item;
        }
      });
    }

    return { cart: filteredCart };
  } catch (error) {
    console.error('[addToShoppingCart] Error adding item to shopping cart:', error);
    throw error;
  }
};

export const removeFromShoppingCart = async (
  projectName: string,
  userID: string,
  itemId: string
): Promise<CartAPIResponse> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${encodeURIComponent(projectName)}/shopping-cart/${encodeURIComponent(userID)}/items/${encodeURIComponent(itemId)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to remove item from cart: ${response.status}`);
    }

    const rawData = await response.json();

    // Check if backend is using old format with { items: [], ready: boolean } or { ready: boolean }
    const isOldFormat =
      rawData.cart &&
      (Array.isArray(rawData.cart.items) ||
        (typeof rawData.cart.ready === 'boolean' && Object.keys(rawData.cart).length <= 2));

    if (isOldFormat) {
      console.warn('[removeFromShoppingCart] Backend using OLD format, converting to new format');
      const cartObject: Record<string, CartItem> = {};

      // Only process items if they exist
      if (Array.isArray(rawData.cart.items)) {
        rawData.cart.items.forEach((cartItem: CartItem) => {
          cartObject[cartItem.id] = cartItem;
        });
      }
      return { cart: cartObject };
    }

    // New format - filter out non-CartItem entries
    const data: CartAPIResponse = rawData;
    const filteredCart: Record<string, CartItem> = {};
    if (data.cart && typeof data.cart === 'object') {
      Object.keys(data.cart).forEach((key) => {
        const item = data.cart[key];
        if (item && typeof item === 'object' && 'id' in item && 'quantity' in item) {
          filteredCart[key] = item;
        }
      });
    }

    return { cart: filteredCart };
  } catch (error) {
    console.error('[removeFromShoppingCart] Error removing item from shopping cart:', error);
    throw error;
  }
};

export const createPaymentLink = async (
  projectName: string,
  userID: string,
  paymentData: {
    name: string;
    email: string;
    userNationalId: string;
    address: {
      ciudadId: string;
      direccion: string;
      departamentoId: string;
      barrio: string;
    };
  }
): Promise<{ paymentLink: string; orderId: string; amount: number }> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${encodeURIComponent(projectName)}/orders/${encodeURIComponent(userID)}/payment-link`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to create payment link: ${response.status}`);
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error('[createPaymentLink] Error creating payment link:', error);
    throw error;
  }
};

// AI Endpoints
export const makeFriendly = async (projectName: string, text: string): Promise<{ text: string }> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${encodeURIComponent(projectName)}/ai/make-friendly`,
      {
        method: 'POST',
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
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
      credentials: 'include',
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

// Payment Verification API
export interface PaymentVerificationRequest {
  message: string;
  userID: string;
  namespace: string;
  confirmed: boolean;
}

export const verifyPayment = async (request: PaymentVerificationRequest): Promise<boolean> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/messages/verify-payment`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to verify payment: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error verifying payment:', error);
    return false;
  }
};

// ============================================
// Store Cart API (for users from chat with ut token)
// ============================================

export interface StoreCartItemPayload {
  id: string;
  quantity: number;
  personalizations: Array<{ type: string; value: string }>;
}

export interface StoreCartResponse {
  items: StoreCartItemPayload[];
}

/**
 * Get store cart for a user (public endpoint, uses ut token)
 */
export const getStoreCart = async (
  namespace: string,
  userToken: string
): Promise<StoreCartResponse | null> => {
  try {
    const res = await fetch(`${API_BASE_URL}/stores/${namespace}/cart?ut=${userToken}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('[getStoreCart] Error:', error);
    return null;
  }
};

/**
 * Add item to store cart (public endpoint, uses ut token)
 */
export const addStoreCartItem = async (
  namespace: string,
  userToken: string,
  item: StoreCartItemPayload
): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE_URL}/stores/${namespace}/cart/items?ut=${userToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return res.ok;
  } catch (error) {
    console.error('[addStoreCartItem] Error:', error);
    return false;
  }
};

/**
 * Update item quantity in store cart (public endpoint, uses ut token)
 */
export const updateStoreCartItem = async (
  namespace: string,
  userToken: string,
  itemId: string,
  quantity: number
): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE_URL}/stores/${namespace}/cart/items/${itemId}?ut=${userToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
    return res.ok;
  } catch (error) {
    console.error('[updateStoreCartItem] Error:', error);
    return false;
  }
};

/**
 * Remove item from store cart (public endpoint, uses ut token)
 */
export const removeStoreCartItem = async (
  namespace: string,
  userToken: string,
  itemId: string
): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE_URL}/stores/${namespace}/cart/items/${itemId}?ut=${userToken}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (error) {
    console.error('[removeStoreCartItem] Error:', error);
    return false;
  }
};

// ============================================
// Store Session API (for anonymous users)
// ============================================

export interface StoreSessionPayload {
  sessionId: string;
  cart: {
    items: StoreCartItemPayload[];
    ready: boolean;
  };
}

export interface StoreSessionResponse {
  sessionId: string;
  success: boolean;
  userToken?: string;
}

/**
 * Save store session for anonymous user (public endpoint)
 */
export const saveStoreSession = async (
  namespace: string,
  payload: StoreSessionPayload
): Promise<StoreSessionResponse | null> => {
  try {
    const res = await fetch(`${API_BASE_URL}/stores/${namespace}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('[saveStoreSession] Error:', error);
    return null;
  }
};

/**
 * Get store session by ID (public endpoint)
 */
export const getStoreSession = async (
  namespace: string,
  sessionId: string
): Promise<StoreSessionPayload | null> => {
  try {
    const res = await fetch(`${API_BASE_URL}/stores/${namespace}/session/${sessionId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('[getStoreSession] Error:', error);
    return null;
  }
};

/**
 * Get store contact info (phone number for WhatsApp)
 */
export interface StoreContactInfo {
  phone: string | null;
}

export const getStoreContactInfo = async (namespace: string): Promise<StoreContactInfo | null> => {
  try {
    const res = await fetch(`${API_BASE_URL}/stores/${namespace}/contact`);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('[getStoreContactInfo] Error:', error);
    return null;
  }
};

// Batch Progress API for tracking batch workloads
export type BatchStepStatus = 'pending' | 'in_progress' | 'completed';

export interface BatchStepProgress {
  status: BatchStepStatus;
  total: number;
  completed: number;
  startTime?: number;
  endTime?: number;
}

// Extended step progress for chat audit (has different timestamp fields)
export interface ChatAuditStepProgress {
  status: BatchStepStatus;
  total: number;
  completed: number;
  startedAt?: number;
  completedAt?: number;
  updatedAt?: number;
}

// Product import batch progress type
export interface ProductImportBatchProgress {
  imageEmbeddings: BatchStepProgress;
  imageUpsert: BatchStepProgress;
  productEmbeddings: BatchStepProgress;
  productUpsert: BatchStepProgress;
}

// Chat audit batch progress type
export interface ChatAuditBatchProgress {
  chatAudit: ChatAuditStepProgress;
  conversationAnalysis: ChatAuditStepProgress;
}

// WhatsApp integration response type
export interface WhatsAppIntegrationResponse {
  success: boolean;
  message: string;
  data: {
    phone: string;
    namespace: string;
    isOnApp: boolean;
    historySyncBatchId: string | null;
  };
}

// WhatsApp history sync progress types
export interface WhatsAppHistorySyncStepProgress {
  status: BatchStepStatus;
  total: number;
  completed: number;
  startedAt?: number;
  updatedAt?: number;
}

export interface WhatsAppHistorySyncProgress {
  historySync: WhatsAppHistorySyncStepProgress;
}

// Response types for chat audit API
export interface InitiateChatAuditResponse {
  success: boolean;
  batchWorkloadID: string;
  message: string;
  trackingPath: string;
}

// Generic batch progress function - cast result at call site
export const getBatchProgress = async (namespace: string, batchWorkloadID: string): Promise<unknown> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${encodeURIComponent(namespace)}/batch-progress/${encodeURIComponent(batchWorkloadID)}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch batch progress: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching batch progress:', error);
    return null;
  }
};

/**
 * Initiate a chat audit for a project
 * POST /admin/chatAudit
 */
export const initiateChatAudit = async (
  namespace: string,
  maxChats: number = 100
): Promise<InitiateChatAuditResponse | null> => {
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/admin/chatAudit`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ namespace, maxChats }),
    });

    if (!response.ok) {
      throw new Error(`Failed to initiate chat audit: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error initiating chat audit:', error);
    return null;
  }
};

/**
 * Get the completed chat audit report
 * GET /projects/{namespace}/audits/{batchWorkloadID}
 */
export const getChatAuditReport = async (
  namespace: string,
  batchWorkloadID: string
): Promise<ChatAuditReport | null> => {
  try {
    const response = await authenticatedFetch(
      `${API_BASE_URL}/projects/${encodeURIComponent(namespace)}/audits/${encodeURIComponent(batchWorkloadID)}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch chat audit report: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching chat audit report:', error);
    return null;
  }
};
