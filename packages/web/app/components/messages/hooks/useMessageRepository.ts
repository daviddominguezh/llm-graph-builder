
import { useState } from 'react';
import { useDispatch } from 'react-redux';

import { MessageRepository } from '../core/repositories/MessageRepository';
import { LocalStorageCache } from '../core/services/CacheService';

function createRepository(dispatch: ReturnType<typeof useDispatch>): MessageRepository {
  const cacheService = new LocalStorageCache();
  return new MessageRepository(dispatch, cacheService);
}

/**
 * Hook to provide MessageRepository instance
 *
 * This creates a repository instance with proper dependencies injected.
 * The repository is stored in state to maintain the same instance across re-renders.
 */
export const useMessageRepository = (): MessageRepository => {
  const dispatch = useDispatch();
  const [repository] = useState<MessageRepository>(() => createRepository(dispatch));

  return repository;
};
