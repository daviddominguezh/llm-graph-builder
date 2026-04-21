import React, { createContext, useContext } from 'react';

interface TenantContextValue {
  tenantId: string;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

interface TenantProviderProps {
  tenantId: string;
  children: React.ReactNode;
}

/**
 * Provides the resolved tenantId to all messaging components.
 * Replaces the old pattern of reading `params.projectName` from the URL.
 */
export const TenantProvider: React.FC<TenantProviderProps> = ({ tenantId, children }) => {
  return <TenantContext.Provider value={{ tenantId }}>{children}</TenantContext.Provider>;
};

/**
 * Returns the current tenant ID (UUID) for API calls and socket subscriptions.
 * Must be used within a TenantProvider.
 */
export function useTenantId(): string {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenantId must be used within a TenantProvider');
  }
  return ctx.tenantId;
}
