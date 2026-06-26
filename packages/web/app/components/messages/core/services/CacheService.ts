import type { CacheServiceInterface, CachedData } from '../../MessagesDashboard.types';

/**
 * Abstract Cache Service for managing local data caching
 * Supports multiple storage backends (localStorage, IndexedDB, memory)
 */
export abstract class CacheService implements CacheServiceInterface {
  protected defaultTTL = 5 * 60 * 1000; // 5 minutes default

  abstract get<T>(key: string, namespace: string): Promise<CachedData<T> | null>;
  abstract set<T>(key: string, namespace: string, data: T, ttl?: number): Promise<void>;
  abstract update<T>(key: string, namespace: string, data: Partial<T>): Promise<void>;
  abstract invalidate(key: string, namespace: string): Promise<void>;
  abstract clear(namespace?: string): Promise<void>;

  /**
   * Check if cached data is still valid
   */
  protected isValid<T>(cached: CachedData<T>): boolean {
    if (!cached.expiresAt) return true;
    return Date.now() < cached.expiresAt;
  }

  /**
   * Generate cache key with namespace
   */
  protected getCacheKey(key: string, namespace: string): string {
    return `${namespace}:${key}`;
  }
}

/**
 * LocalStorage implementation of CacheService
 * Suitable for small to medium datasets
 */
export class LocalStorageCache extends CacheService {
  private readonly prefix = 'messagesDashboard';

  async get<T>(key: string, namespace: string): Promise<CachedData<T> | null> {
    try {
      const cacheKey = this.getStorageKey(key, namespace);
      const item = localStorage.getItem(cacheKey);

      if (!item) return null;

      const cached = JSON.parse(item) as CachedData<T>;

      if (!this.isValid(cached)) {
        await this.invalidate(key, namespace);
        return null;
      }

      return cached;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set<T>(key: string, namespace: string, data: T, ttl?: number): Promise<void> {
    try {
      const cacheKey = this.getStorageKey(key, namespace);
      const expiresAt = ttl ? Date.now() + ttl : Date.now() + this.defaultTTL;

      const cached: CachedData<T> = {
        data,
        timestamp: Date.now(),
        expiresAt,
      };

      localStorage.setItem(cacheKey, JSON.stringify(cached));
    } catch (error) {
      console.error('Cache set error:', error);
      // Handle quota exceeded error
      if (error instanceof DOMException && error.code === 22) {
        await this.clearOldest();
        // Retry once
        try {
          const cacheKey = this.getStorageKey(key, namespace);
          const cached: CachedData<T> = {
            data,
            timestamp: Date.now(),
            expiresAt: ttl ? Date.now() + ttl : undefined,
          };
          localStorage.setItem(cacheKey, JSON.stringify(cached));
        } catch {
          // Fail silently, cache is not critical
        }
      }
    }
  }

  async update<T>(key: string, namespace: string, data: Partial<T>): Promise<void> {
    const existing = await this.get<T>(key, namespace);
    if (!existing) {
      // If no existing data, create new entry with partial data
      await this.set(key, namespace, data as T);
      return;
    }

    const updated = {
      ...existing.data,
      ...data,
    };

    await this.set(key, namespace, updated, existing.expiresAt ? existing.expiresAt - Date.now() : undefined);
  }

  async invalidate(key: string, namespace: string): Promise<void> {
    const cacheKey = this.getStorageKey(key, namespace);
    localStorage.removeItem(cacheKey);
  }

  async clear(namespace?: string): Promise<void> {
    if (!namespace) {
      // Clear all cache
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });
    } else {
      // Clear specific namespace
      const keysToRemove: string[] = [];
      const namespacePrefix = `${this.prefix}:${namespace}:`;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(namespacePrefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
      });
    }
  }

  private getStorageKey(key: string, namespace: string): string {
    return `${this.prefix}:${namespace}:${key}`;
  }

  private async clearOldest(): Promise<void> {
    // Find and remove the oldest cached items
    const items: Array<{ key: string; timestamp: number }> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        try {
          const item = localStorage.getItem(key);
          if (item) {
            const parsed = JSON.parse(item) as CachedData<unknown>;
            items.push({ key, timestamp: parsed.timestamp });
          }
        } catch {
          // Invalid item, remove it
          localStorage.removeItem(key);
        }
      }
    }

    // Sort by timestamp (oldest first)
    items.sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest 20% of items
    const toRemove = Math.ceil(items.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      localStorage.removeItem(items[i].key);
    }
  }
}

/**
 * IndexedDB implementation of CacheService
 * Suitable for large datasets and better performance
 */
export class IndexedDBCache extends CacheService {
  private readonly dbName = 'messagesDashboardCache';
  private readonly dbVersion = 1;
  private db: IDBDatabase | null = null;
  private readonly storeName = 'cache';

  constructor() {
    super();
    this.initDatabase();
  }

  private async initDatabase(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(request.error);
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('namespace', 'namespace', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  private async ensureDatabase(): Promise<void> {
    if (!this.db) {
      await this.initDatabase();
    }
  }

  async get<T>(key: string, namespace: string): Promise<CachedData<T> | null> {
    await this.ensureDatabase();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const { db } = this;

    return await new Promise<CachedData<T> | null>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(this.getCacheKey(key, namespace));

      request.onerror = () => {
        reject(request.error);
      };
      request.onsuccess = () => {
        const { result } = request;
        if (!result) {
          resolve(null);
          return;
        }

        const cached: CachedData<T> = {
          data: result.data,
          timestamp: result.timestamp,
          expiresAt: result.expiresAt,
        };

        if (!this.isValid(cached)) {
          this.invalidate(key, namespace);
          resolve(null);
          return;
        }

        resolve(cached);
      };
    });
  }

  async set<T>(key: string, namespace: string, data: T, ttl?: number): Promise<void> {
    await this.ensureDatabase();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const { db } = this;

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      const record = {
        id: this.getCacheKey(key, namespace),
        namespace,
        data,
        timestamp: Date.now(),
        expiresAt: ttl ? Date.now() + ttl : Date.now() + this.defaultTTL,
      };

      const request = store.put(record);
      request.onerror = () => {
        reject(request.error);
      };
      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async update<T>(key: string, namespace: string, data: Partial<T>): Promise<void> {
    const existing = await this.get<T>(key, namespace);
    if (!existing) {
      await this.set(key, namespace, data as T);
      return;
    }

    const updated = {
      ...existing.data,
      ...data,
    };

    await this.set(key, namespace, updated, existing.expiresAt ? existing.expiresAt - Date.now() : undefined);
  }

  async invalidate(key: string, namespace: string): Promise<void> {
    await this.ensureDatabase();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const { db } = this;

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(this.getCacheKey(key, namespace));

      request.onerror = () => {
        reject(request.error);
      };
      request.onsuccess = () => {
        resolve();
      };
    });
  }

  async clear(namespace?: string): Promise<void> {
    await this.ensureDatabase();

    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const { db } = this;

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      if (!namespace) {
        // Clear all
        const request = store.clear();
        request.onerror = () => {
          reject(request.error);
        };
        request.onsuccess = () => {
          resolve();
        };
      } else {
        // Clear by namespace
        const index = store.index('namespace');
        const request = index.openCursor(IDBKeyRange.only(namespace));

        request.onerror = () => {
          reject(request.error);
        };
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
          } else {
            resolve();
          }
        };
      }
    });
  }
}

/**
 * Memory cache implementation for testing and development
 */
export class MemoryCache extends CacheService {
  private readonly cache = new Map<string, CachedData<unknown>>();

  async get<T>(key: string, namespace: string): Promise<CachedData<T> | null> {
    const cacheKey = this.getCacheKey(key, namespace);
    const cached = this.cache.get(cacheKey) as CachedData<T> | undefined;

    if (!cached) return null;

    if (!this.isValid(cached)) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached;
  }

  async set<T>(key: string, namespace: string, data: T, ttl?: number): Promise<void> {
    const cacheKey = this.getCacheKey(key, namespace);
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
      expiresAt: ttl ? Date.now() + ttl : Date.now() + this.defaultTTL,
    };

    this.cache.set(cacheKey, cached);
  }

  async update<T>(key: string, namespace: string, data: Partial<T>): Promise<void> {
    const existing = await this.get<T>(key, namespace);
    if (!existing) {
      await this.set(key, namespace, data as T);
      return;
    }

    const updated = {
      ...existing.data,
      ...data,
    };

    await this.set(key, namespace, updated, existing.expiresAt ? existing.expiresAt - Date.now() : undefined);
  }

  async invalidate(key: string, namespace: string): Promise<void> {
    const cacheKey = this.getCacheKey(key, namespace);
    this.cache.delete(cacheKey);
  }

  async clear(namespace?: string): Promise<void> {
    if (!namespace) {
      this.cache.clear();
    } else {
      const keysToDelete: string[] = [];
      this.cache.forEach((_, key) => {
        if (key.startsWith(`${namespace}:`)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => this.cache.delete(key));
    }
  }
}

/**
 * Factory function to create appropriate cache implementation
 */
export function createCacheService(
  type: 'localStorage' | 'indexedDB' | 'memory' = 'localStorage'
): CacheService {
  switch (type) {
    case 'indexedDB':
      return new IndexedDBCache();
    case 'memory':
      return new MemoryCache();
    case 'localStorage':
    default:
      return new LocalStorageCache();
  }
}
