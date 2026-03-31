import React, { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Mic } from 'lucide-react';

interface AttachmentMenuOption {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface AttachmentMenuProps {
  onSelectVoiceNote: () => void;
  onSelectDocument: () => void;
  onClose: () => void;
}

/**
 * AttachmentMenu
 *
 * Displays attachment options when the paperclip button is clicked.
 * Features:
 * - 2 options: Voice Note (Audio), Document
 * - Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape)
 * - Click to select
 * - Styled to match AIDialog component
 */
export const AttachmentMenu: React.FC<AttachmentMenuProps> = ({
  onSelectVoiceNote,
  onSelectDocument,
  onClose,
}) => {
  const t = useTranslations('messages');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  const options: AttachmentMenuOption[] = [
    {
      id: 'voice-note',
      label: t('Audio'),
      icon: <Mic size={16} strokeWidth={2} />,
    },
    {
      id: 'document',
      label: t('Documento'),
      icon: <FileText size={16} strokeWidth={2} />,
    },
  ];

  const handleSelect = (optionId: string) => {
    if (optionId === 'voice-note') {
      onSelectVoiceNote();
    } else if (optionId === 'document') {
      onSelectDocument();
    }
    onClose();
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % options.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + options.length) % options.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (options[selectedIndex]) {
            handleSelect(options[selectedIndex].id);
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
  }, [selectedIndex, onClose, options]);

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = dialogRef.current?.children[selectedIndex] as HTMLElement;
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Handle click outside to close
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

  return (
    <div
      ref={dialogRef}
      className="z-50 min-w-[10rem] overflow-hidden rounded-md border bg-white p-1 text-gray-950 shadow-md"
    >
      {options.map((option, index) => (
        <div
          key={option.id}
          className={`relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none transition-colors ${
            index === selectedIndex
              ? 'bg-gray-100 text-gray-900'
              : 'hover:bg-gray-100 hover:text-gray-900'
          }`}
          onMouseDown={(e) => {
            // Prevent the click-outside handler from firing
            e.preventDefault();
            e.stopPropagation();
            handleSelect(option.id);
          }}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0">{option.icon}</div>
            <span className="font-medium">{option.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
