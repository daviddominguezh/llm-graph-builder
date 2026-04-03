import type { ProviderSendResult } from '../../types/index.js';
import { waitForRateLimit } from '../rateLimiter.js';

const IG_API_BASE = 'https://graph.instagram.com/v18.0';

/** Instagram rate limit: 150 requests per 1-second window */
const IG_RATE_LIMIT_MAX = 150;
const IG_RATE_LIMIT_WINDOW_MS = 1_000;

interface InstagramApiResponse {
  recipient_id?: string;
  message_id?: string;
  error?: { message: string; code: number };
}

function buildRateLimitKey(igUserId: string): string {
  return `ratelimit:ig:${igUserId}`;
}

function isInstagramApiResponse(data: unknown): data is InstagramApiResponse {
  return data !== null && typeof data === 'object';
}

export async function sendInstagramMessage(
  igUserId: string,
  accessToken: string,
  recipientId: string,
  text: string
): Promise<ProviderSendResult> {
  // Check rate limit before calling the API
  await waitForRateLimit(buildRateLimitKey(igUserId), IG_RATE_LIMIT_MAX, IG_RATE_LIMIT_WINDOW_MS);

  const url = `${IG_API_BASE}/${igUserId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
  });

  const data: unknown = await response.json();
  if (!isInstagramApiResponse(data)) {
    throw new Error('Instagram API: unexpected response format');
  }

  if (data.error !== undefined) {
    throw new Error(`Instagram API error: ${data.error.message}`);
  }

  return { originalId: data.message_id ?? '' };
}
