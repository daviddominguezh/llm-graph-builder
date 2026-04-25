import type { LastMessage, Message } from '@/app/types/chat';
import { type Socket, io } from 'socket.io-client';

import type { SyncServiceInterface } from '../../MessagesDashboard.types';

/**
 * Service for handling real-time synchronization and WebSocket connections
 * Manages bidirectional communication between client and server
 */
export class SyncService implements SyncServiceInterface {
  private socket: Socket | null = null;
  private readonly eventHandlers = new Map<string, Set<(data: unknown) => void>>();
  private projectName: string | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private isInitialized = false;

  /**
   * Initialize the sync service with a project
   */
  initialize(projectName: string): void {
    if (this.isInitialized && this.projectName === projectName) {
      return; // Already initialized for this project
    }

    this.destroy(); // Clean up any existing connection
    this.projectName = projectName;
    this.isInitialized = true;

    this.connect();
  }

  /**
   * Establish WebSocket connection
   */
  private connect(): void {
    if (!this.projectName) return;

    const socketUrl = this.getSocketUrl();

    this.socket = io(socketUrl, {
      transports: ['websocket'],
      query: {
        tenantId: this.projectName,
      },
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
    });

    this.setupSocketListeners();
  }

  /**
   * Get the WebSocket server URL
   */
  private getSocketUrl(): string {
    // Use new backend URL (port 4000)
    const wsUrl = process.env.NEXT_PUBLIC_API_URL;
    if (wsUrl) return wsUrl;

    // Use same protocol and host as current page
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  /**
   * Set up socket event listeners
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.emit('sync:connected', { tenantId: this.projectName });
    });

    this.socket.on('disconnect', (reason) => {
      this.emit('sync:disconnected', { reason });

      // Handle reconnection strategy
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, reconnect immediately
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emit('sync:error', {
          type: 'max_reconnect_attempts',
          message: 'Failed to establish connection after maximum attempts',
        });
      }

      // Exponential backoff for reconnection
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Max 30 seconds
    });

    // Application-specific events
    this.socket.on('message:new', (data) => {
      this.emit('message:new', data);
    });

    this.socket.on('message:sent', (data) => {
      this.emit('message:sent', data);
    });

    this.socket.on('message:read', (data) => {
      this.emit('message:read', data);
    });

    this.socket.on('conversation:updated', (data) => {
      this.emit('conversation:updated', data);
    });

    this.socket.on('conversation:deleted', (data) => {
      this.emit('conversation:deleted', data);
    });

    this.socket.on('typing:start', (data) => {
      this.emit('typing:start', data);
    });

    this.socket.on('typing:stop', (data) => {
      this.emit('typing:stop', data);
    });

    // AI/Chatbot specific events
    this.socket.on('ai:status', (data) => {
      this.emit('ai:status', data);
    });

    this.socket.on('ai:inquiry', (data) => {
      this.emit('ai:inquiry', data);
    });

    this.socket.on('ai:response', (data) => {
      this.emit('ai:response', data);
    });
  }

  /**
   * Clean up and destroy the connection
   */
  destroy(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.eventHandlers.clear();
    this.projectName = null;
    this.isInitialized = false;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
  }

  /**
   * Subscribe to an event
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.add(handler);
    }

    // Return unsubscribe function
    return () => {
      const handlers = this.eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.eventHandlers.delete(event);
        }
      }
    };
  }

  /**
   * Emit an event to all local subscribers
   */
  emit(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Send an event to the server
   */
  sendToServer(event: string, data: unknown): void {
    if (!this.socket?.connected) {
      console.warn(`Cannot send event ${event}: socket not connected`);
      // Queue the event for later sending when reconnected
      this.queueEvent(event, data);
      return;
    }

    this.socket.emit(event, data);
  }

  /**
   * Queue events for sending when reconnected
   */
  private readonly eventQueue: Array<{ event: string; data: unknown }> = [];

  private queueEvent(event: string, data: unknown): void {
    this.eventQueue.push({ event, data });

    // Listen for reconnection to flush queue
    const unsubscribe = this.on('sync:connected', () => {
      this.flushEventQueue();
      unsubscribe();
    });
  }

  /**
   * Flush queued events after reconnection
   */
  private flushEventQueue(): void {
    while (this.eventQueue.length > 0) {
      const queuedItem = this.eventQueue.shift();
      if (queuedItem) {
        const { event, data } = queuedItem;
        this.sendToServer(event, data);
      }
    }
  }

  /**
   * Type-safe event handlers for specific message types
   */
  onNewMessage(handler: (message: Message) => void): () => void {
    return this.on('message:new', handler as (data: unknown) => void);
  }

  onMessageRead(handler: (chatId: string) => void): () => void {
    return this.on('message:read', (data) => {
      const { chatId } = data as { chatId: string };
      handler(chatId);
    });
  }

  onConversationUpdated(handler: (conversation: LastMessage) => void): () => void {
    return this.on('conversation:updated', handler as (data: unknown) => void);
  }

  /**
   * Typing indicators
   */
  startTyping(chatId: string): void {
    this.sendToServer('typing:start', { chatId, tenantId: this.projectName });
  }

  stopTyping(chatId: string): void {
    this.sendToServer('typing:stop', { chatId, tenantId: this.projectName });
  }

  /**
   * Connection status
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' {
    if (!this.socket) return 'disconnected';
    if (this.socket.connected) return 'connected';
    return 'connecting';
  }

  /**
   * Request sync for specific conversation
   */
  requestSync(chatId: string): void {
    this.sendToServer('sync:request', {
      chatId,
      tenantId: this.projectName,
      timestamp: Date.now(),
    });
  }

  /**
   * Acknowledge message received
   */
  acknowledgeMessage(messageId: string): void {
    this.sendToServer('message:acknowledge', {
      messageId,
      tenantId: this.projectName,
      timestamp: Date.now(),
    });
  }
}

/**
 * Singleton instance
 */
let syncServiceInstance: SyncService | null = null;

/**
 * Get or create sync service instance
 */
export function getSyncService(): SyncService {
  syncServiceInstance ||= new SyncService();
  return syncServiceInstance;
}

/**
 * Export default instance
 */
export default getSyncService();
