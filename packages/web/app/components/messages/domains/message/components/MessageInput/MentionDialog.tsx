
import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Avatar from 'react-nice-avatar';

import { generateAvatarConfig } from '@/app/utils/avatar';

import { MentionDialogProps } from './types';

/**
 * MentionDialog
 *
 * Displays a filterable list of collaborators when @ is typed in note mode.
 * Features:
 * - Filters collaborators by name as user types
 * - Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape)
 * - Click to select
 * - Only shows active/pending collaborators
 * - Styled to match SelectContent component
 */
export const MentionDialog: React.FC<MentionDialogProps> = ({
  collaborators,
  query,
  onSelect,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset selected index when query changes
  useEffect(() => {
    queueMicrotask(() => setSelectedIndex(0));
  }, [query]);

  // Filter collaborators by query and status
  const filteredCollaborators = collaborators.filter((collab) => {
    // Only show active or pending collaborators
    if (collab.status !== 'active' && collab.status !== 'pending') {
      return false;
    }

    // Filter by name (case-insensitive)
    if (query) {
      return collab.name.toLowerCase().includes(query.toLowerCase());
    }

    return true;
  });

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredCollaborators.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredCollaborators.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredCollaborators.length) % filteredCollaborators.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCollaborators[selectedIndex]) {
            onSelect(filteredCollaborators[selectedIndex]);
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
  }, [filteredCollaborators, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = dialogRef.current?.children[selectedIndex] as HTMLElement;
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Handle click outside to close - use mouseup instead of mousedown to avoid conflict with onClick
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use mouseup instead of mousedown to let onClick fire first
    document.addEventListener('mouseup', handleClickOutside);
    return () => document.removeEventListener('mouseup', handleClickOutside);
  }, [onClose]);

  if (filteredCollaborators.length === 0) {
    return null;
  }

  return (
    <div
      ref={dialogRef}
      className="z-50 min-w-[8rem] overflow-hidden rounded-md border bg-white p-1 text-gray-950 shadow-md max-h-64 overflow-y-auto"
    >
      {filteredCollaborators.map((collaborator, index) => {
        const avatarConfig = generateAvatarConfig(collaborator.email);

        return (
          <div
            key={collaborator.email}
            className={`relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors ${
              index === selectedIndex
                ? 'bg-gray-100 text-gray-900'
                : 'hover:bg-gray-100 hover:text-gray-900'
            }`}
            onMouseDown={(e) => {
              // Prevent the click-outside handler from firing
              e.preventDefault();
              e.stopPropagation();
              onSelect(collaborator);
            }}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <div className="flex items-center gap-2">
              {collaborator.profilePic ? (
                <Image
                  src={collaborator.profilePic}
                  alt={collaborator.name}
                  width={16}
                  height={16}
                  className="rounded-full object-cover"
                  style={{ minWidth: '16px' }}
                  unoptimized
                />
              ) : (
                <Avatar
                  {...avatarConfig}
                  style={{ width: '16px', height: '16px', minWidth: '16px' }}
                  className="rounded-full"
                />
              )}
              <span className="font-medium">{collaborator.name}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
