import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Search, Zap, Hash } from 'lucide-react';

import type { QuickReply } from '@/app/components/messages/services/api';

import { groupByCategory } from '@/app/components/messages/chatSettings/quickRepliesUtils';

interface QuickRepliesDialogProps {
  quickReplies: QuickReply[];
  onSelect: (quickReply: QuickReply) => void;
  onClose: () => void;
  shortcutQuery?: string; // Optional query from slash trigger (e.g., "/hi")
}

/**
 * QuickRepliesDialog
 *
 * Displays available quick replies when the Quick Replies button is clicked.
 * Features:
 * - Search/filter functionality
 * - Grouped by category
 * - Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape)
 * - Shows shortcuts and highlights variables
 * - Click to select
 */
export const QuickRepliesDialog: React.FC<QuickRepliesDialogProps> = ({
  quickReplies,
  onSelect,
  onClose,
  shortcutQuery,
}) => {
  const t = useTranslations('messages');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter quick replies based on shortcut query or search query
  const filteredQuickReplies = useMemo(() => {
    // If triggered by slash, filter by shortcut
    if (shortcutQuery) {
      const query = shortcutQuery.toLowerCase();
      return quickReplies.filter(
        (qr) => qr.shortcut?.toLowerCase().startsWith(query)
      );
    }

    // Otherwise, use regular search query
    if (!searchQuery.trim()) return quickReplies;

    const query = searchQuery.toLowerCase();
    return quickReplies.filter(
      (qr) =>
        qr.title?.toLowerCase().includes(query) ||
        qr.text.toLowerCase().includes(query) ||
        qr.shortcut?.toLowerCase().includes(query) ||
        qr.category?.toLowerCase().includes(query) ||
        qr.description?.toLowerCase().includes(query)
    );
  }, [quickReplies, searchQuery, shortcutQuery]);

  // Group filtered quick replies by category
  const groupedQuickReplies = useMemo(() => {
    return groupByCategory(filteredQuickReplies);
  }, [filteredQuickReplies]);

  // Create flat list for keyboard navigation
  const flatQuickReplies = useMemo(() => {
    return Object.values(groupedQuickReplies).flat();
  }, [groupedQuickReplies]);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % flatQuickReplies.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + flatQuickReplies.length) % flatQuickReplies.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (flatQuickReplies[selectedIndex]) {
            onSelect(flatQuickReplies[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, onSelect, onClose, flatQuickReplies]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mouseup', handleClickOutside);
    return () => document.removeEventListener('mouseup', handleClickOutside);
  }, [onClose]);

  // Highlight variables in text
  const highlightVariables = (text: string) => {
    const parts = text.split(/(\{\{[^}]+\}\})/g);
    return parts.map((part, index) => {
      if (part.match(/\{\{[^}]+\}\}/)) {
        return (
          <span key={index} className="text-blue-600 font-medium">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div
      ref={dialogRef}
      className="z-50 w-full h-full flex flex-col overflow-hidden rounded-md border bg-white text-gray-950 shadow-md"
    >
      {/* Search Header - hidden when triggered by slash */}
      {!shortcutQuery && (
        <div className="p-3 border-b bg-gray-50 flex-shrink-0">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('Search quick replies…')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-md outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Quick Replies List */}
      <div className="flex-1 overflow-y-auto p-1">
        {flatQuickReplies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Zap size={48} className="text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">
              {searchQuery ? t('No quick replies match your search') : t('No quick replies available')}
            </p>
          </div>
        ) : (
          Object.entries(groupedQuickReplies).map(([category, replies]) => (
            <div key={category} className="mb-2">
              {/* Category Header */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase">
                <Hash size={12} />
                {t(category)}
              </div>

              {/* Quick Replies in Category */}
              {replies.map((quickReply) => {
                const currentIndex = flatQuickReplies.indexOf(quickReply);
                const isSelected = currentIndex === selectedIndex;

                return (
                  <div
                    key={quickReply.quickReplyID}
                    className={`relative flex cursor-pointer select-none flex-col rounded-sm px-3 py-2.5 text-sm outline-none transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-gray-900'
                        : 'hover:bg-gray-50 hover:text-gray-900'
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelect(quickReply);
                    }}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                  >
                    {/* Title */}
                    <div className="font-semibold text-sm text-gray-900 mb-1">
                      {quickReply.title}
                    </div>

                    {/* Header with shortcut and description */}
                    <div className="flex items-center gap-2 mb-1">
                      {quickReply.shortcut && (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-mono rounded">
                          {quickReply.shortcut}
                        </span>
                      )}
                      {quickReply.description && (
                        <span className="text-xs text-gray-500 italic">
                          {quickReply.description}
                        </span>
                      )}
                    </div>

                    {/* Quick Reply Text */}
                    <div className="text-sm text-gray-700 line-clamp-2">
                      {highlightVariables(quickReply.text)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Footer Hint */}
      {flatQuickReplies.length > 0 && (
        <div className="px-3 py-2 border-t bg-gray-50 text-xs text-gray-500 flex justify-between flex-shrink-0">
          <span>{t('Use ↑↓ to navigate, Enter to select')}</span>
          <span className="text-gray-400">
            {filteredQuickReplies.length} {t('replies')}
          </span>
        </div>
      )}
    </div>
  );
};
