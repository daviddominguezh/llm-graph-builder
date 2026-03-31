/**
 * Core services for the Messages Dashboard
 *
 * Architecture Decision:
 * We use direct imports of services rather than a service container pattern.
 * Services are imported and used directly where needed for simplicity.
 *
 * - CacheService: Handles caching with multiple strategies (localStorage, IndexedDB, memory)
 * - SyncService: Manages WebSocket connections and real-time sync
 * - MessageQueueService: Processes fetch queue and handles realtime message integration
 * - SearchService: Provides indexed search across conversations and messages using MiniSearch
 */
import {
  CacheService,
  IndexedDBCache,
  LocalStorageCache,
  MemoryCache,
  createCacheService,
} from './CacheService';
import { MessageQueueService, createMessageQueueService } from './MessageQueueService';
import { SearchService, createSearchService } from './SearchService';
import { SyncService, getSyncService } from './SyncService';

// Export service classes and factory functions
export {
  CacheService,
  LocalStorageCache,
  IndexedDBCache,
  MemoryCache,
  createCacheService,
  SyncService,
  getSyncService,
  MessageQueueService,
  createMessageQueueService,
  SearchService,
  createSearchService,
};

// Export service types
export type { CacheServiceInterface, SyncServiceInterface } from '../../MessagesDashboard.types';
