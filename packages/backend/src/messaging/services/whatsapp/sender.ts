import type { ProviderSendResult } from '../../types/index.js';

const WA_API_BASE = 'https://graph.facebook.com/v20.0';

interface WhatsAppApiResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number };
}

async function callWhatsAppApi(
  phoneNumberId: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<WhatsAppApiResponse> {
  const url = `${WA_API_BASE}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return (await response.json()) as WhatsAppApiResponse;
}

function extractOriginalId(result: WhatsAppApiResponse): string {
  const firstMessage = result.messages?.[0];
  return firstMessage?.id ?? '';
}

function throwOnApiError(result: WhatsAppApiResponse): void {
  if (result.error !== undefined) {
    throw new Error(`WhatsApp API error: ${result.error.message}`);
  }
}

export async function sendWhatsAppTextMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  text: string
): Promise<ProviderSendResult> {
  const result = await callWhatsAppApi(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'text',
    text: { body: text },
  });

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}

export async function sendWhatsAppImageMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  imageUrl: string,
  caption?: string
): Promise<ProviderSendResult> {
  const imagePayload: Record<string, unknown> = { link: imageUrl };
  if (caption !== undefined) imagePayload.caption = caption;

  const result = await callWhatsAppApi(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'image',
    image: imagePayload,
  });

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}

export async function sendWhatsAppAudioMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  audioUrl: string
): Promise<ProviderSendResult> {
  const result = await callWhatsAppApi(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'audio',
    audio: { link: audioUrl },
  });

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}

export async function sendWhatsAppDocumentMessage(
  phoneNumberId: string,
  accessToken: string,
  recipientPhone: string,
  documentUrl: string,
  filename?: string
): Promise<ProviderSendResult> {
  const docPayload: Record<string, unknown> = { link: documentUrl };
  if (filename !== undefined) docPayload.filename = filename;

  const result = await callWhatsAppApi(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'document',
    document: docPayload,
  });

  throwOnApiError(result);
  return { originalId: extractOriginalId(result) };
}
