import { type ReactNode, createContext, useContext } from 'react';

import type { StoredUser } from './userStorage.js';

const UserContext = createContext<StoredUser | null>(null);

export function UserProvider({ value, children }: { value: StoredUser; children: ReactNode }) {
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

// Returns null when used outside a UserProvider — e.g. embedded mode,
// which doesn't prompt for a name.
export function useUser(): StoredUser | null {
  return useContext(UserContext);
}
