import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import type { Tag } from '@services/api';

import { Button } from '@/components/ui/button';

import { TAG_COLORS } from '@features/chatSettings/tagsUtils';

interface TagSelectorProps {
  availableTags: Tag[];
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
}

/**
 * TagSelector
 *
 * Multi-select component for assigning tags to a chat.
 * Displays all available tags (predefined + custom) and allows selection.
 */
export const TagSelector: React.FC<TagSelectorProps> = ({ availableTags, selectedTagIds, onTagsChange }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const capitalizeFirstLetter = (str: string) => {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const handleTagClick = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      // Remove tag
      onTagsChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      // Add tag
      onTagsChange([...selectedTagIds, tagId]);
    }
  };

  const getTagName = (tag: Tag) => {
    // For predefined tags, use translation
    if (TAG_COLORS[tag.tagID]) {
      return capitalizeFirstLetter(t(`tag-${tag.tagID}`));
    }
    // For custom tags, use the tag name directly
    return capitalizeFirstLetter(tag.tag);
  };

  const getTagColor = (tag: Tag) => {
    // For predefined tags, use predefined color
    if (TAG_COLORS[tag.tagID]) {
      return TAG_COLORS[tag.tagID];
    }
    // For custom tags, use gray
    return '#6b7280';
  };

  return (
    <div className="w-full">
      {/* Selected tags */}
      {selectedTagIds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedTagIds.map((tagId) => {
            const tag = availableTags.find((t) => t.tagID === tagId);
            if (!tag) return null;

            const tagColor = getTagColor(tag);
            const isPredefinedTag = TAG_COLORS[tag.tagID];

            // For predefined tags, use tag color; for custom tags, use gray/black
            const borderStyle = isPredefinedTag ? { borderColor: tagColor } : {};
            const textStyle = isPredefinedTag ? { color: tagColor } : {};

            return (
              <button
                key={tagId}
                type="button"
                onClick={() => handleTagClick(tagId)}
                className={`cursor-pointer flex items-center gap-1.5 px-2 py-1 rounded-md border bg-gray-50 hover:bg-gray-100 transition-colors ${
                  !isPredefinedTag ? 'border-gray-300 text-gray-900' : ''
                }`}
                style={isPredefinedTag ? { ...borderStyle } : {}}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tagColor }} />
                <span className="text-xs font-medium" style={isPredefinedTag ? textStyle : {}}>
                  {getTagName(tag)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Add tag button */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="cursor-pointer w-full"
      >
        + {t('Add Tag')}
      </Button>

      {/* Tag selection dropdown */}
      {isExpanded && (
        <div className="mt-2 max-h-64 overflow-y-auto border border-gray-200 rounded-md bg-white">
          {availableTags.map((tag) => {
            const isSelected = selectedTagIds.includes(tag.tagID);

            return (
              <button
                key={tag.tagID}
                type="button"
                onClick={() => handleTagClick(tag.tagID)}
                className={`cursor-pointer w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors ${
                  isSelected ? 'bg-blue-50' : ''
                }`}
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getTagColor(tag) }} />
                <span className="text-xs font-medium flex-1">{getTagName(tag)}</span>
                {isSelected && <X size={14} className="text-red-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
