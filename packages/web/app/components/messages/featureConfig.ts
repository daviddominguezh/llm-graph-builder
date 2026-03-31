import type { FeatureRegistryConfig } from './core/registry';

/**
 * Feature Configuration
 *
 * This file defines all available features for the messages dashboard.
 * To add a new feature:
 * 1. Import the feature component
 * 2. Add it to the features array with configuration
 * 3. Optionally add its ID to enabledFeatureIds
 *
 * @example
 * ```ts
 * import { NotesFeature } from './features/notes';
 *
 * export const featureConfig: FeatureRegistryConfig = {
 *   features: [
 *     {
 *       config: {
 *         id: 'notes',
 *         name: 'Message Notes',
 *         description: 'Add private notes to conversations',
 *         category: 'productivity',
 *         enabled: true,
 *       },
 *       component: NotesFeature,
 *     },
 *   ],
 *   enabledFeatureIds: ['notes'],
 * };
 * ```
 */
export const featureConfig: FeatureRegistryConfig = {
  features: [
    // Add your features here
    // Example:
    // {
    //   config: {
    //     id: 'quick-replies',
    //     name: 'Quick Replies',
    //     description: 'Add quick reply buttons above message input',
    //     category: 'messaging',
    //     enabled: false,
    //   },
    //   component: QuickRepliesFeature,
    // },
  ],

  // List of feature IDs to enable
  // If empty and enableAllFeatures is false, only features with enabled: true will load
  enabledFeatureIds: [],

  // Enable all features (useful for development)
  enableAllFeatures: false,
};
