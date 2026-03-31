'use no memo';

import { useRef } from 'react';
import { useDispatch } from 'react-redux';

import { MessageRepository } from '../core/repositories/MessageRepository';
import { LocalStorageCache } from '../core/services/CacheService';

/**
 * Hook to provide MessageRepository instance
 *
 * This creates a repository instance with proper dependencies injected.
 * The repository is stored in a ref to maintain the same instance across re-renders.
 */
export const useMessageRepository = (): MessageRepository => {
  const dispatch = useDispatch();
  const repositoryRef = useRef<MessageRepository | null>(null);

  if (!repositoryRef.current) {
    const cacheService = new LocalStorageCache();
    repositoryRef.current = new MessageRepository(dispatch, cacheService);
  }

  return repositoryRef.current;
};
