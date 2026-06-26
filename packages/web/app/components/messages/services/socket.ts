import { getApiURL } from '@/app/components/messages/shared/utilStubs';
import {
  SOCKET_HEARTBEAT_INTERVAL_MS,
  SOCKET_RECONNECTION_ATTEMPTS,
  SOCKET_RECONNECTION_DELAY,
  SOCKET_RECONNECT_WAIT_TIEMOUT_MS,
  SOCKET_TIMEOUT_MS,
} from '@/app/constants/socket';
import type { LastMessage } from '@/app/types/chat';
import type { FetchFilesOptions, FileFetchingData, FileFetchingStatus } from '@/app/types/drive';
import type { MessageFetchingStatus } from '@/app/types/messages';
import type { SocketCallback } from '@/app/types/socket';
import { type Socket, io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

let socket: Socket;
const activeListeners: Record<string, SocketCallback> = {};
let connectionStatus = 'disconnected';
const requestCallbacks = new Map<string, SocketCallback>();
let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;

const subscriptions: Record<string, string> = {};
// Store subscription callbacks for re-subscription on reconnect
const subscriptionCallbacks: Record<string, (data: LastMessage, tab: string) => void> = {};

const registerSocketEvents = () => {
  socket.on('connect', () => {
    connectionStatus = 'connected';
    Object.entries(activeListeners).forEach(([event, callback]) => {
      socket.on(event, callback);
    });

    // Re-subscribe to all stored subscriptions
    const namespacesToResubscribe = Object.keys(subscriptionCallbacks);
    if (namespacesToResubscribe.length > 0) {
      // Clear subscription state so subscribeToMessages will re-subscribe
      const keysToRemove = namespacesToResubscribe.filter((ns) => subscriptionCallbacks[ns]);
      for (const key of Object.keys(subscriptions)) {
        if (keysToRemove.includes(key)) {
          subscriptions[key] = '';
        }
      }
      // Re-subscribe with stored callbacks
      namespacesToResubscribe.forEach((namespace) => {
        const callback = subscriptionCallbacks[namespace];
        if (callback) {
          resubscribeToNamespace(namespace, callback);
        }
      });
    }
  });

  socket.on('disconnect', (reason) => {
    connectionStatus = 'disconnected';

    // Clear all subscriptions so they can be re-established on reconnect
    for (const key of Object.keys(subscriptions)) {
      subscriptions[key] = '';
    }

    // If server closed the connection due to timeout,
    // we can attempt to reconnect manually
    if (reason === 'io server disconnect' || reason === 'ping timeout' || reason === 'transport close') {
      setTimeout(() => socket.connect(), SOCKET_RECONNECT_WAIT_TIEMOUT_MS);
    }
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
    connectionStatus = 'error';
  });

  socket.on('reconnect', () => {
    connectionStatus = 'connected';
  });

  socket.on('reconnect_failed', () => {
    console.error('WebSocket reconnection failed');
    connectionStatus = 'failed';
  });
};

const registerSocketCustomEvents = () => {
  // Set up listener for file status updates
  socket.on('files:status', handleFileStatus);
  socket.on('message:new', handleReceiveMessage);
};

/**
 * Start heartbeat interval to check socket connection health
 */
const startHeartbeat = () => {
  // Clear any existing heartbeat
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
  }

  heartbeatIntervalId = setInterval(() => {
    const isConnected = socket?.connected;

    // If socket exists but is not connected, try to reconnect
    if (socket && !isConnected && connectionStatus !== 'connecting') {
      connectionStatus = 'connecting';
      socket.connect();
    }

    // If connection status is stale (says connected but socket disagrees), fix it
    if (connectionStatus === 'connected' && !isConnected) {
      connectionStatus = 'disconnected';
    }
  }, SOCKET_HEARTBEAT_INTERVAL_MS);
};

/**
 * Stop heartbeat interval
 */
export const stopHeartbeat = () => {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
};

/**
 * Internal function to re-subscribe to a namespace after reconnection
 */
const resubscribeToNamespace = (
  namespace: string,
  onUpdateCallback: (data: LastMessage, tab: string) => void
) => {
  const requestId = uuidv4();

  // Mark as subscribed with a placeholder tab (will be updated by next subscribeToMessages call)
  subscriptions[namespace] = subscriptions[namespace] || 'messages';

  requestCallbacks.set(requestId, (req) => {
    const statusData = req as MessageFetchingStatus;
    onUpdateCallback(statusData.data, subscriptions[namespace]);
  });

  socket.emit('messages:subscribe', {
    tenantId: namespace,
    requestId,
  });
};

export const initializeSocket = () => {
  if (socket) return socket;
  try {
    // Init socket
    socket = io(getApiURL(), {
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: SOCKET_RECONNECTION_ATTEMPTS,
      reconnectionDelay: SOCKET_RECONNECTION_DELAY,
      timeout: SOCKET_TIMEOUT_MS,
      transports: ['websocket'],
    });

    // Register all socket events
    registerSocketEvents();
    registerSocketCustomEvents();

    // Start heartbeat to monitor connection health
    startHeartbeat();

    return socket;
  } catch (error) {
    console.error('Error initializing WebSocket:', error);
    throw error;
  }
};

// Get the current connection status
export const getConnectionStatus = () => connectionStatus;

export const ensureSocketConnection = async () => {
  // If socket isn't connected, attempt to connect and wait for connection
  if (connectionStatus !== 'connected') {
    // Try to connect if possible
    socket.connect();
    // Wait for connection (max 5 seconds)
    for (let i = 0; i < 50; i++) {
      if (connectionStatus === 'connected') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // If still not connected after waiting, throw error
    if (connectionStatus !== 'connected') {
      const errorMsg = 'Failed to establish socket connection after 5 seconds';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }
};

const handleReceiveMessage = (messageData: MessageFetchingStatus) => {
  const { requestId } = messageData;
  if (requestCallbacks.has(requestId)) {
    const callback = requestCallbacks.get(requestId);
    if (callback) callback(messageData);
  }
};

const handleFileStatus = (statusData: FileFetchingStatus) => {
  const { requestId, status } = statusData;

  let reqId = requestId;

  // If we have a specific requestId, try to find its callback
  if (requestId && requestCallbacks.has(requestId)) {
    const callback = requestCallbacks.get(requestId);
    if (callback) callback(statusData);
  } else {
    // If we can't find a specific callback, call the most recent one
    // This handles cases where the server generates its own requestId
    if (requestCallbacks.size > 0) {
      const lastRequestId = Array.from(requestCallbacks.keys()).pop();
      if (!lastRequestId) return;
      reqId = lastRequestId;
      const callback = requestCallbacks.get(lastRequestId);
      if (callback) callback(statusData);
    }
  }
  // If this is a final status, remove the callback
  if (status === 'completed' || status === 'error' || status === 'cancelled') {
    requestCallbacks.delete(reqId);
  }
};

export const subscribeToMessages = async (
  namespace: string,
  activeTab: string,
  onUpdateCallback: (data: LastMessage, tab: string) => void
) => {
  // Always store the callback for re-subscription on reconnect
  subscriptionCallbacks[namespace] = onUpdateCallback;

  if (!activeTab || activeTab.length === 0) {
    return;
  }
  if (subscriptions[namespace]) {
    subscriptions[namespace] = activeTab;
    return;
  }
  subscriptions[namespace] = activeTab;
  if (!socket) initializeSocket();
  await ensureSocketConnection();

  const requestId = uuidv4();
  requestCallbacks.set(requestId, (req) => {
    const statusData = req as MessageFetchingStatus;
    onUpdateCallback(statusData.data, subscriptions[namespace]);
  });

  // Send the request to subscribe to messages
  socket.emit('messages:subscribe', {
    tenantId: namespace,
    requestId,
  });
};

// Function to fetch files via WebSocket
export const fetchFilesViaSocket = async (
  namespace: string,
  options: FetchFilesOptions,
  onUpdateCallback: (statusData: FileFetchingStatus) => void
) => {
  if (!socket) initializeSocket();
  await ensureSocketConnection();

  const { folderId, includeShared, includeSharedDrives } = options;

  // Generate a new request ID
  const requestId = `file-request-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  return await new Promise<FileFetchingData | null>((resolve, reject) => {
    try {
      // Register the callback for status updates
      requestCallbacks.set(requestId, (req) => {
        const statusData = req as FileFetchingStatus;
        onUpdateCallback(statusData);
        if (statusData.status === 'completed') resolve(statusData.data);
        else if (statusData.status === 'error') {
          reject(new Error(statusData.message || 'Error fetching files'));
        }
      });

      // Send the request to fetch files
      socket.emit('files:fetch', {
        folderId,
        namespace,
        includeShared,
        includeSharedDrives,
        refresh: options.refresh || false,
        requestId,
      });

      onUpdateCallback({
        status: 'starting',
        progress: 0,
        message: 'Connecting to server...',
        processedItems: 0,
        totalItems: 0,
        requestId,
        totalPages: 0,
        data: null,
      });
    } catch (error) {
      console.error('Error sending file fetch request via WebSocket:', error);
      reject(error);
    }
  });
};

// Function to cancel an ongoing file fetch operation
export const cancelFileFetch = (requestId: string) => {
  if (!socket || connectionStatus !== 'connected') return false;
  socket.emit('files:cancel', { requestId });
  // Clean up any registered callbacks
  if (requestCallbacks.has(requestId)) requestCallbacks.delete(requestId);
  return true;
};

const socketService = {
  initializeSocket,
  fetchFilesViaSocket,
  cancelFileFetch,
  getConnectionStatus,
  stopHeartbeat,
};

export default socketService;
