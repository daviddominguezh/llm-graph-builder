import { useTenantId } from '@/app/components/messages/core/contexts/TenantContext';
import { getFinalUserInfo } from '@/app/components/messages/services/api';
import type { FinalUserInfoAPI } from '@/app/types/finalUsers';
import { useEffect, useRef, useState } from 'react';

type UserInfoCache = Record<string, FinalUserInfoAPI>;

// Shared cache across all hook instances
const userInfoCache: UserInfoCache = {};

/**
 * Hook to fetch and cache user information for a chat
 * @param chatId - The chat ID to fetch user info for
 * @param isActive - Whether this chat is currently active (forces fresh fetch)
 * @returns User information including userGender, or null if not available
 */
export const useUserInfo = (chatId: string | null, isActive = false): FinalUserInfoAPI | null => {
  const projectName = useTenantId();
  const [userInfo, setUserInfo] = useState<FinalUserInfoAPI | null>(null);
  const activeChatRef = useRef<string | null>(chatId);

  useEffect(() => {
    activeChatRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    const run = async () => {
      if (!chatId || !projectName) {
        setUserInfo(null);
        return;
      }

      // If not active and cached data is available, use cache
      if (!isActive && userInfoCache[chatId]) {
        // Use cached data, do not fetch again
        setUserInfo(userInfoCache[chatId]);
        return;
      }

      // Show cached data immediately if available (while fetching fresh data)
      if (userInfoCache[chatId]) {
        setUserInfo(userInfoCache[chatId]);
      }

      // If active or not cached, fetch fresh data
      try {
        const info = await getFinalUserInfo(projectName, chatId);

        // Only update if we're still on the same chat
        if (activeChatRef.current === chatId) {
          setUserInfo(info);
          userInfoCache[chatId] = info;
        }
      } catch (error) {
        console.error('Error fetching user info:', error);
      }
    };

    run();
  }, [chatId, projectName, isActive]);

  return userInfo;
};
