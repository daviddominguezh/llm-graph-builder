import type { ProviderSendResult } from '../../types/index.js';

const IG_API_BASE = 'https://graph.instagram.com/v18.0';

interface InstagramApiResponse {
  recipient_id?: string;
  message_id?: string;
  error?: { message: string; code: number };
}

export async function sendInstagramMessage(
  igUserId: string,
  accessToken: string,
  recipientId: string,
  text: string
): Promise<ProviderSendResult> {
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

  const result = (await response.json()) as InstagramApiResponse;

  if (result.error !== undefined) {
    throw new Error(`Instagram API error: ${result.error.message}`);
  }

  return { originalId: result.message_id ?? '' };
}
