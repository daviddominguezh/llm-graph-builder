/**
 * Fetch Instagram user profile (username, name) via Graph API.
 */

const IG_API_BASE = 'https://graph.instagram.com';

interface InstagramProfileData {
  username?: string;
  name?: string;
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
    const data = (await response.json()) as InstagramProfileData;
    return {
      username: data.username ?? '',
      name: data.name ?? '',
    };
  } catch {
    return null;
  }
}
