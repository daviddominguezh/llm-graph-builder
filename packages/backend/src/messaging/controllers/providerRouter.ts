import type { ChannelType } from '../types/index.js';
import { TEST_USER_CHANNEL_ID } from '../types/index.js';

export function detectChannel(userChannelId: string): ChannelType {
  if (userChannelId === TEST_USER_CHANNEL_ID) return 'api';
  if (userChannelId.startsWith('whatsapp:')) return 'whatsapp';
  if (userChannelId.startsWith('instagram:')) return 'instagram';
  return 'api';
}

export function stripChannelPrefix(userChannelId: string): string {
  const colonIndex = userChannelId.indexOf(':');
  if (colonIndex === -1) return userChannelId;
  return userChannelId.slice(colonIndex + 1);
}

export function isTestChannel(userChannelId: string): boolean {
  return userChannelId === TEST_USER_CHANNEL_ID;
}
