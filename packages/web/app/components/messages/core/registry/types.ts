import type { ComponentType } from 'react';

/**
 * Feature Configuration
 *
 * Defines how a feature should behave in the dashboard.
 */
export interface FeatureConfig {
  /** Unique identifier for the feature */
  id: string;

  /** Human-readable name */
  name: string;

  /** Optional description of what this feature does */
  description?: string;

  /** Whether this feature is enabled by default */
  enabled?: boolean;

  /** Feature version for compatibility tracking */
  version?: string;

  /** Optional permissions required to use this feature */
  permissions?: string[];

  /** Category for organization (e.g., 'messaging', 'productivity', 'analytics') */
  category?: string;
}

/**
 * Feature Module
 *
 * A self-contained feature that can be registered in the dashboard.
 * Features can register slots, consume contexts, and extend functionality
 * without modifying core code.
 */
export interface Feature {
  /** Feature metadata and configuration */
  config: FeatureConfig;

  /** The React component that implements this feature */
  component: ComponentType;
}

/**
 * Feature Registry Configuration
 *
 * Configuration for the entire feature system.
 */
export interface FeatureRegistryConfig {
  /** List of all available features */
  features: Feature[];

  /** IDs of features that should be enabled */
  enabledFeatureIds?: string[];

  /** Whether to enable all features by default (useful for development) */
  enableAllFeatures?: boolean;
}
