import type { Tag } from '@/app/components/messages/services/api';

export const PREDEFINED_TAGS = [
  'lead',
  'active',
  'vip',
  'support',
  'churned',
  'frequent',
  'hot',
  'browser',
  'escalated',
  'abandoned',
];

export const TAG_COLORS: Record<string, string> = {
  lead: '#0277BD',
  active: '#2E7D32',
  vip: '#4527A0',
  support: '#FF6F00',
  churned: '#D32F2F',
  frequent: '#9E9D24',
  hot: '#BF360C',
  browser: '#6D4C41',
  escalated: '#00695C',
  abandoned: '#616161',
};

/**
 * Combines predefined tags with custom tags fetched from API
 * Returns a complete list of all tags (default + custom)
 */
export const combineAllTags = (customTags: Record<string, Tag>): Array<Tag> => {
  // Create tag objects for predefined tags
  const predefinedTagObjects: Tag[] = PREDEFINED_TAGS.map((tagName) => ({
    tagID: tagName,
    tag: tagName,
    description: `tag-${tagName}-description`, // Will be translated by i18n
  }));

  // Convert custom tags to array
  const customTagsArray: Tag[] = Object.entries(customTags).map(([tagID, tag]) => ({
    ...tag,
    tagID,
  }));

  // Combine both
  return [...predefinedTagObjects, ...customTagsArray];
};
