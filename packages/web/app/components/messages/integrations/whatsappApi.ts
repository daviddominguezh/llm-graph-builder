const API_BASE_URL = '/api/messaging';

export interface WhatsAppConnectParams {
  phone: string;
  phoneNumberId: string;
  waba: string;
  authCode: string;
  agentId: string;
}

export interface WhatsAppConnectResponse {
  success: boolean;
  data?: { phone: string; isOnApp: boolean };
}

/**
 * Exchange Facebook auth code + embedded-signup IDs with the backend
 * to register a WhatsApp Business phone number.
 */
export async function connectWhatsAppIntegration(
  tenantId: string,
  params: WhatsAppConnectParams
): Promise<WhatsAppConnectResponse> {
  const { getAuthToken, handleAuthError } = await import('@/app/components/messages/services/auth');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const apiKey = process.env.NEXT_PUBLIC_CLOSER_API_KEY;
  if (apiKey) headers.api_key = apiKey;

  const token = await getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${API_BASE_URL}/projects/${tenantId}/integrations/whatsapp`;

  const response = await fetch(url, {
    method: 'POST',

    headers,
    body: JSON.stringify(params),
  });

  if (response.status === 401 || response.status === 403) {
    handleAuthError(new Error(`Auth error: ${response.status}`));
    throw new Error('Authentication failed');
  }

  if (!response.ok) {
    const errorData: { error?: string } = await response.json();
    throw new Error(errorData.error ?? 'Failed to connect WhatsApp');
  }

  return response.json() as Promise<WhatsAppConnectResponse>;
}
