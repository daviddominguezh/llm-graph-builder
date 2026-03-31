import { selectCurrentProjectName, selectCurrentProjectRole } from '@reducers/user';
import { useAppSelector } from '@store/index';
import { useMemo } from 'react';

import {
  APP_SECTION,
  canAccessSection,
  getDefaultRouteForRole,
  getDefaultSettingsRouteForRole,
  getRolePermissions,
} from '@globalUtils/rbac';

import { COLLABORATOR_ROLE } from '@globalTypes/projectInnerSettings';

interface UseRBACReturn {
  currentRole: COLLABORATOR_ROLE | null;
  canAccess: (section: APP_SECTION) => boolean;
  hasAccess: (section: APP_SECTION) => boolean;
  permissions: APP_SECTION[];
  getRedirectRoute: () => string;
  getSettingsRedirectRoute: () => string;
}

/**
 * Role-Based Access Control hook
 * Provides permission checking for the current user's role
 *
 * @example
 * ```tsx
 * const { canAccess, currentRole, permissions } = useRBAC();
 *
 * if (canAccess(APP_SECTION.BILLING)) {
 *   // Render billing section
 * }
 *
 * // Or use in conditional rendering
 * {canAccess(APP_SECTION.METRICS) && <MetricsTab />}
 * ```
 */
export const useRBAC = (): UseRBACReturn => {
  const currentRole = useAppSelector(selectCurrentProjectRole);
  const currentProjectName = useAppSelector(selectCurrentProjectName);

  // Get all permissions for the current role
  const permissions = useMemo(() => {
    return getRolePermissions(currentRole);
  }, [currentRole]);

  /**
   * Check if the current user can access a section
   */
  const canAccess = useMemo(
    () =>
      (section: APP_SECTION): boolean => {
        return canAccessSection(currentRole, section);
      },
    [currentRole]
  );

  /**
   * Alias for canAccess for better readability
   */
  const hasAccess = canAccess;

  /**
   * Get the default redirect route for the current role
   */
  const getRedirectRoute = useMemo(
    () => (): string => {
      return getDefaultRouteForRole(currentRole, currentProjectName || '');
    },
    [currentRole, currentProjectName]
  );

  /**
   * Get the default settings redirect route for the current role
   */
  const getSettingsRedirectRoute = useMemo(
    () => (): string => {
      return getDefaultSettingsRouteForRole(currentRole, currentProjectName || '');
    },
    [currentRole, currentProjectName]
  );

  return {
    currentRole,
    canAccess,
    hasAccess,
    permissions,
    getRedirectRoute,
    getSettingsRedirectRoute,
  };
};
