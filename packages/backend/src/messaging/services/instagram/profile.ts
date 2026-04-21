/**
 * Fetch Instagram user profile (username, name) via Graph API.
 */

const IG_API_BASE = 'https://graph.instagram.com';

interface InstagramProfileData {
  username?: string;
  name?: string;
}

function isInstagramProfileData(value: unknown): value is InstagramProfileData {
  return typeof value === 'object' && value !== null;
}

function toInstagramProfileData(value: unknown): InstagramProfileData {
  if (isInstagramProfileData(value)) return value;
  return {};
}

export interface InstagramProfile {
  username: string;
  name: string;
}

export async function fetchInstagramProfile(
  igUserId: string,
  accessToken: string
): Promise<InstagramProfile | null> {
  try {
    const url = `${IG_API_BASE}/${igUserId}?fields=username,name&access_token=${accessToken}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const raw: unknown = await response.json();
    const data = toInstagramProfileData(raw);
    return {
      username: data.username ?? '',
      name: data.name ?? '',
    };
  } catch {
    return null;
  }
}
