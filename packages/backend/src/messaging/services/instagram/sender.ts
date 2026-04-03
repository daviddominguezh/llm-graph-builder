import type { ProviderSendResult } from '../../types/index.js';
import { waitForRateLimit } from '../rateLimiter.js';
import { withRetry } from '../retry.js';

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

function throwOnApiError(data: InstagramApiResponse): void {
  if (data.error !== undefined) {
    throw new Error(`Instagram API error: ${data.error.message}`);
  }
}

async function callInstagramApi(
  igUserId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<InstagramApiResponse> {
  await waitForRateLimit(buildRateLimitKey(igUserId), IG_RATE_LIMIT_MAX, IG_RATE_LIMIT_WINDOW_MS);

  const url = `${IG_API_BASE}/${igUserId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data: unknown = await response.json();
  if (!isInstagramApiResponse(data)) {
    throw new Error('Instagram API: unexpected response format');
  }

  return data;
}

/* ─── Send text message ─── */

export async function sendInstagramMessage(
  igUserId: string,
  accessToken: string,
  recipientId: string,
  text: string
): Promise<ProviderSendResult> {
  const data = await withRetry(() =>
    callInstagramApi(igUserId, accessToken, {
      recipient: { id: recipientId },
      message: { text },
    })
  );

  throwOnApiError(data);
  return { originalId: data.message_id ?? '' };
}

/* ─── Typing indicator (Fix 26) ─── */

/**
 * Send Instagram typing indicator via Sender Actions API.
 * POST /{igUserId}/messages with sender_action: 'typing_on'
 *
 * This is non-critical; errors are swallowed.
 */
export async function sendInstagramTypingIndicator(
  igUserId: string,
  accessToken: string,
  recipientId: string
): Promise<void> {
  try {
    await callInstagramApi(igUserId, accessToken, {
      recipient: { id: recipientId },
      sender_action: 'typing_on',
    });
  } catch {
    // Typing indicator is non-critical; swallow errors
  }
}
