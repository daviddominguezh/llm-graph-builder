import { createClient } from './supabase/client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface InitiateOAuthResponse {
  authorizeUrl: string;
}

async function getSessionToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function initiateOAuthFlow(orgId: string, libraryItemId: string): Promise<void> {
  const token = await getSessionToken();
  if (token === null) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}/agents/mcp-oauth/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orgId, libraryItemId }),
  });

  if (!res.ok) throw new Error('Failed to initiate OAuth flow');

  const json = (await res.json()) as InitiateOAuthResponse;
  window.open(json.authorizeUrl, '_blank');
}
