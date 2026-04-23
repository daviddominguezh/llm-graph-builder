// Persistent per-user identity for the standalone widget. Prompted once on
// first visit, stored in localStorage, then reused across all sessions.
// The userId is a proper UUID (DB-safe); the display name is carried
// separately in execute request metadata.

const USER_KEY = 'openflow-widget-user';

export interface StoredUser {
  userId: string;
  displayName: string;
}

function isStoredUser(value: unknown): value is StoredUser {
  if (typeof value !== 'object' || value === null) return false;
  const { userId, displayName } = value as Partial<StoredUser>;
  return typeof userId === 'string' && typeof displayName === 'string';
}

export function loadStoredUser(): StoredUser | null {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createAndStoreUser(displayName: string): StoredUser {
  const trimmed = displayName.trim();
  const user: StoredUser = {
    userId: crypto.randomUUID(),
    displayName: trimmed,
  };
  try {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* localStorage may be unavailable; still return the user for this session */
  }
  return user;
}
