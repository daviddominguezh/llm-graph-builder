import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  MessageSquare,
  Sparkles,
  UserRound,
} from 'lucide-react';

export interface AIDialogOption {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface AIDialogProps {
  onSelect: (optionId: string) => void;
  onClose: () => void;
}

/**
 * AIDialog
 *
 * Displays AI assistance options when the AI button is clicked.
 * Features:
 * - 4 options: Make it more friendly, Make it more formal, Fix grammar, Ask AI
 * - Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape)
 * - Click to select
 * - Styled to match MentionDialog component
 */
export const AIDialog: React.FC<AIDialogProps> = ({ onSelect, onClose }) => {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Define AI options
  const options: AIDialogOption[] = [
    {
      id: 'friendly',
      label: t('Make it more friendly'),
      description: t('Transform your message to a friendlier tone'),
      icon: <MessageSquare size={16} strokeWidth={2} />,
    },
    {
      id: 'formal',
      label: t('Make it more formal'),
      description: t('Transform your message to a more formal tone'),
      icon: <UserRound size={16} strokeWidth={2} />,
    },
    {
      id: 'fix-grammar',
      label: t('Fix grammar'),
      description: t('Correct grammar and spelling mistakes'),
      icon: <FileText size={16} strokeWidth={2} />,
    },
    {
      id: 'ask-ai',
      label: t('Ask AI'),
      description: t('Get AI assistance for your message'),
      icon: <Sparkles size={16} strokeWidth={2} />,
    },
  ];

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
            onSelect(options[selectedIndex].id);
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
  }, [selectedIndex, onSelect, onClose, options]);

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
      className="z-50 min-w-[16rem] overflow-hidden rounded-md border bg-white p-1 text-gray-950 shadow-md max-h-64 overflow-y-auto"
    >
      {options.map((option, index) => (
        <div
          key={option.id}
          className={`relative flex cursor-pointer select-none items-start rounded-sm px-3 py-2.5 text-sm outline-none transition-colors ${
            index === selectedIndex
              ? 'bg-gray-100 text-gray-900'
              : 'hover:bg-gray-100 hover:text-gray-900'
          }`}
          onMouseDown={(e) => {
            // Prevent the click-outside handler from firing
            e.preventDefault();
            e.stopPropagation();
            onSelect(option.id);
          }}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <div className="flex items-start gap-3 w-full">
            <div className="flex-shrink-0 mt-0.5">{option.icon}</div>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{option.label}</span>
              <span className="text-xs text-gray-500">{option.description}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
