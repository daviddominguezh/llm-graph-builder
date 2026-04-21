import React, { createContext, useContext, useMemo } from 'react';
import type { Feature, FeatureRegistryConfig } from './types';

interface FeatureRegistryContextValue {
  /** All registered features (enabled and disabled) */
  allFeatures: Feature[];

  /** Only enabled features */
  enabledFeatures: Feature[];

  /** Check if a feature is enabled by ID */
  isFeatureEnabled: (featureId: string) => boolean;

  /** Get a feature by ID */
  getFeature: (featureId: string) => Feature | undefined;

  /** Get all features in a category */
  getFeaturesByCategory: (category: string) => Feature[];
}

const FeatureRegistryContext = createContext<FeatureRegistryContextValue | undefined>(undefined);

interface FeatureRegistryProps {
  children: React.ReactNode;
  config: FeatureRegistryConfig;
}

/**
 * FeatureRegistry
 *
 * Manages and renders all dashboard features.
 * Features can be enabled/disabled through configuration without code changes.
 *
 * @example
 * ```tsx
 * <FeatureRegistry config={{
 *   features: [notesFeature, remindersFeature, tagsFeature],
 *   enabledFeatureIds: ['notes', 'reminders']
 * }}>
 *   <MessagesDashboardLayout />
 * </FeatureRegistry>
 * ```
 */
export const FeatureRegistry: React.FC<FeatureRegistryProps> = ({ children, config }) => {
  const { features, enabledFeatureIds = [], enableAllFeatures = false } = config;

  // Determine which features are enabled
  const enabledFeatures = useMemo(() => {
    if (enableAllFeatures) {
      return features;
    }

    return features.filter((feature) => {
      // Check if explicitly enabled in config
      if (enabledFeatureIds.includes(feature.config.id)) {
        return true;
      }

      // Check if enabled by default in feature config
      if (feature.config.enabled === true && !enabledFeatureIds.length) {
        return true;
      }

      return false;
    });
  }, [features, enabledFeatureIds, enableAllFeatures]);

  const isFeatureEnabled = (featureId: string): boolean => {
    return enabledFeatures.some((f) => f.config.id === featureId);
  };

  const getFeature = (featureId: string): Feature | undefined => {
    return features.find((f) => f.config.id === featureId);
  };

  const getFeaturesByCategory = (category: string): Feature[] => {
    return features.filter((f) => f.config.category === category);
  };

  const contextValue: FeatureRegistryContextValue = {
    allFeatures: features,
    enabledFeatures,
    isFeatureEnabled,
    getFeature,
    getFeaturesByCategory,
  };

  return (
    <FeatureRegistryContext.Provider value={contextValue}>
      {/* Render all enabled feature components */}
      {enabledFeatures.map((feature) => {
        const FeatureComponent = feature.component;
        return <FeatureComponent key={feature.config.id} />;
      })}

      {children}
    </FeatureRegistryContext.Provider>
  );
};

/**
 * useFeatureRegistry Hook
 *
 * Access the feature registry from any component.
 *
 * @example
 * ```tsx
 * const { isFeatureEnabled } = useFeatureRegistry();
 * if (isFeatureEnabled('notes')) {
 *   // Show notes UI
 * }
 * ```
 */
export const useFeatureRegistry = (): FeatureRegistryContextValue => {
  const context = useContext(FeatureRegistryContext);
  if (!context) {
    throw new Error('useFeatureRegistry must be used within a FeatureRegistry');
  }
  return context;
};
