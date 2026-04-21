/* eslint-disable @typescript-eslint/no-explicit-any */
import { useTenantId } from '@/app/components/messages/core/contexts/TenantContext';
import * as api from '@/app/components/messages/services/api';
import Spinner from '@/app/components/messages/shared/spinner';
import type { Collaborator } from '@/app/types/projectInnerSettings';
import { useIsMobile } from '@/app/utils/device';
import { htmlToWhatsappFormat } from '@/app/utils/strs';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  MessageCircle,
  NotepadText,
  Paperclip,
  SendHorizontal,
  Smile,
  Sparkles,
  Strikethrough,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import 'quill/dist/quill.snow.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMessage } from '../../../../core/contexts/MessageContext';
import { Slot } from '../../../../core/slots';
import { AIDialog } from './AIDialog';
import { AskAIModal } from './AskAIModal';
import { AttachmentMenu } from './AttachmentMenu';
import { MentionDialog } from './MentionDialog';
import './MessageInput.css';
import { PendingImagePreview } from './PendingImagePreview';
import { VoiceRecorder } from './VoiceRecorder';
import type { Mention, MentionState, PendingImageAttachment } from './types';
import { useQuillStable } from './useQuillStable';

/**
 * MessageInput component handles message composition and sending
 * Supports text input, media attachments, and keyboard shortcuts
 */
interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string, mode: 'reply' | 'note') => void;
  onAttachmentClick: () => void;
  onVoiceNoteUpload: (audioBlob: Blob, fileName: string) => Promise<void>;
  disabled?: boolean;
  disabledByAI?: boolean;
  disabledByAssignee?: boolean;
  disabledBy24HourRule?: boolean;
  assigneeName?: string | null;
  placeholder?: string;
  className?: string;
  collaborators?: Collaborator[];
  askAIQuestion?: string | null;
  onAskAIQuestionHandled?: () => void;
}

/**
 * Wrapper component that ensures Quill is loaded before rendering MessageInput
 * This prevents react-quilljs from trying to use require() before Quill is available
 */
export const MessageInput: React.FC<MessageInputProps> = (props) => {
  return <MessageInputInner {...props} />;
};

/**
 * Inner component that uses the Quill editor
 * Only rendered after Quill has been loaded globally
 */
const MessageInputInner: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSend,
  onAttachmentClick,
  onVoiceNoteUpload,
  disabled = false,
  disabledByAI = false,
  disabledBy24HourRule = false,
  assigneeName = null,
  placeholder,
  className = '',
  collaborators = [],
  askAIQuestion = null,
  onAskAIQuestionHandled,
}) => {
  const t = useTranslations('messages');
  const projectName = useTenantId();
  const { resolvedTheme } = useTheme();
  const { pendingImageAttachment, clearPendingImageAttachment } = useMessage();

  const [mode, setMode] = useState<'reply' | 'note'>('reply');

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [showAskAIModal, setShowAskAIModal] = useState(false);

  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [currentAIQuestion, setCurrentAIQuestion] = useState<string | null>(null);
  const [showQuickRepliesDialog, setShowQuickRepliesDialog] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const aiDialogRef = useRef<HTMLDivElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const msgInputIconSize = isMobile ? 20 : 20;
  const iconContainerClassname = isMobile ? 'w-10! h-10!' : 'w-8! h-8!';
  const iconClassname = isMobile ? 'w-5! h-5!' : 'w-4! h-4!';
  const iconStrokeWidth = 2;

  // Mention state for @ tagging
  const [mentionState, setMentionState] = useState<MentionState>({
    isActive: false,
    query: '',
    startIndex: 0,
  });

  // Quick reply shortcut state for / trigger
  const [shortcutState, setShortcutState] = useState<{
    isActive: boolean;
    query: string;
    startIndex: number;
  }>({
    isActive: false,
    query: '',
    startIndex: 0,
  });
  // Store mention metadata (emails) for potential future backend processing
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_mentions, setMentions] = useState<Mention[]>([]);
  const [mentionDialogPosition, setMentionDialogPosition] = useState({ top: 0, left: 0 });

  // Use ref to always get the latest mode value in the Enter handler
  const modeRef = useRef<'reply' | 'note'>('reply');

  // Use ref to track Quick Replies dialog state for Enter handler
  const showQuickRepliesDialogRef = useRef<boolean>(false);

  // Ref for pending image attachment (used by Enter handler inside useMemo to avoid stale closures)
  const pendingImageAttachmentRef = useRef<PendingImageAttachment | null>(null);

  // Ref for onSend (Quill registers keyboard bindings once; ref ensures Enter always uses latest handler)
  const onSendRef = useRef(onSend);

  // Editor should only be disabled if AI is enabled AND mode is 'reply', or if AI is processing
  // If mode is 'note', user can always add notes even when AI is active
  const isEditorDisabled = (disabled && mode === 'reply') || isAIProcessing;

  // Keep ref in sync with mode state
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Keep ref in sync with Quick Replies dialog state
  useEffect(() => {
    showQuickRepliesDialogRef.current = showQuickRepliesDialog;
  }, [showQuickRepliesDialog]);

  // Keep ref in sync with pending image attachment
  useEffect(() => {
    pendingImageAttachmentRef.current = pendingImageAttachment;
  }, [pendingImageAttachment]);

  // Keep ref in sync with onSend
  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  // Refs for values used inside Quill keyboard bindings (which are registered once)
  const disabledRef = useRef(disabled);
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Quill configuration - disable toolbar, we'll use custom
  // Memoize with NO external deps so the object identity never changes
  // All live values are accessed through refs inside the handler
  const modules = useMemo(
    () => ({
      toolbar: false,
      keyboard: {
        bindings: {
          enter: {
            key: 'Enter',
            // eslint-disable-next-line react-hooks/unsupported-syntax -- Quill requires `this` for keyboard handlers (React Compiler limitation)
            handler: function (this: { quill: any }) {
              if (showQuickRepliesDialogRef.current) {
                return false;
              }

              const canSend = !disabledRef.current || modeRef.current === 'note';
              if (canSend) {
                const quill = this.quill;
                const text = quill.getText().trim();
                const hasPendingImage = pendingImageAttachmentRef.current !== null;

                if (text || hasPendingImage) {
                  const html = quill.root.innerHTML;
                  const whatsappMessage = text ? htmlToWhatsappFormat(html) : '';

                  onSendRef.current(whatsappMessage, modeRef.current);
                  quill.setText('');
                  onChangeRef.current('');
                  setMentions([]);
                }
              }
              return false;
            },
          },
          'shift-enter': {
            key: 'Enter',
            shiftKey: true,
            handler: () => true,
          },
        },
      },
    }),
    [showQuickRepliesDialogRef, disabledRef, modeRef, pendingImageAttachmentRef, onSendRef, onChangeRef]
  );

  const { quill, quillRef } = useQuillStable({
    modules,
    placeholder: placeholder || t('Type a message'),
    theme: 'snow',
  });

  // Formatting handlers
  const handleFormat = useCallback(
    (format: string, value?: string | boolean) => {
      if (!quill) return;

      if (format === 'list') {
        const currentFormat = quill.getFormat();
        quill.format('list', currentFormat.list === value ? false : value);
      } else {
        const currentFormat = quill.getFormat();
        quill.format(format, !currentFormat[format]);
      }
    },
    [quill]
  );

  // Track whether we are programmatically setting quill text to suppress text-change
  const isSyncingRef = useRef(false);

  // Sync Quill content with external value changes (e.g., chat switching)
  useEffect(() => {
    if (quill) {
      const currentText = quill.getText().trim();
      const newValue = value.trim();

      if (currentText !== newValue) {
        isSyncingRef.current = true;
        try {
          if (newValue === '') {
            quill.setText('');
          } else {
            quill.setText(newValue);
          }
        } finally {
          // Use setTimeout to reset AFTER Quill's synchronous text-change fires
          setTimeout(() => {
            isSyncingRef.current = false;
          }, 0);
        }
      }
    }
  }, [quill, value]);

  // Handle text changes from user typing
  useEffect(() => {
    if (quill) {
      const handler = () => {
        // Skip if this text-change was triggered by our sync effect
        if (isSyncingRef.current) return;
        const text = quill.getText().trim();
        onChangeRef.current(text);
      };

      quill.on('text-change', handler);

      // Disable/enable based on isEditorDisabled (disabled AND mode is 'reply')
      quill.enable(!isEditorDisabled);

      return () => {
        quill.off('text-change', handler);
      };
    }
  }, [quill, isEditorDisabled, onChangeRef]);

  // Focus Quill editor when returning from voice recording mode
  const prevIsRecordingVoice = useRef(isRecordingVoice);
  useEffect(() => {
    // Only trigger when transitioning from recording to not recording
    if (prevIsRecordingVoice.current && !isRecordingVoice && quill) {
      // Focus the editor after a short delay to ensure visibility transition is complete
      const timeoutId = setTimeout(() => {
        try {
          const length = quill.getLength();
          quill.setSelection(length, 0);
        } catch (e) {
          console.debug('[MessageInput] Could not focus Quill after voice recording:', e);
        }
      }, 50);
      prevIsRecordingVoice.current = isRecordingVoice;
      return () => clearTimeout(timeoutId);
    }
    prevIsRecordingVoice.current = isRecordingVoice;
  }, [isRecordingVoice, quill]);

  // Handle @ mention detection (only in 'note' mode)
  useEffect(() => {
    if (!quill || mode !== 'note') {
      // Close mention dialog if not in note mode
      if (mentionState.isActive) {
        setMentionState({ isActive: false, query: '', startIndex: 0 });
      }
      return;
    }

    const handleTextChange = () => {
      // Use setTimeout to ensure selection is updated after text change
      setTimeout(() => {
        const selection = quill.getSelection();
        if (!selection) return;

        const cursorPosition = selection.index;
        const text = quill.getText();

        // Find the last @ before or at cursor position
        let atIndex = -1;
        for (let i = cursorPosition - 1; i >= 0; i--) {
          if (text[i] === '@') {
            atIndex = i;
            break;
          }
          // Stop searching if we hit a newline or go too far
          if (text[i] === '\n' || cursorPosition - i > 50) {
            break;
          }
        }

        // Check if we found an @ and it's at a valid position
        if (atIndex !== -1) {
          // Check if @ is at beginning or after whitespace/newline
          const charBefore = atIndex > 0 ? text[atIndex - 1] : '\n';
          const isValidPosition = charBefore === '\n' || charBefore === ' ' || charBefore === '\t';

          if (isValidPosition) {
            // Extract the query (text between @ and cursor)
            const query = text.substring(atIndex + 1, cursorPosition);

            // Check if query contains whitespace (which means mention should close)
            if (query.includes(' ') || query.includes('\n')) {
              setMentionState({ isActive: false, query: '', startIndex: 0 });
              return;
            }

            // Update mention state
            setMentionState({
              isActive: true,
              query: query,
              startIndex: atIndex,
            });

            // Calculate dialog position (not used currently, but kept for future enhancements)
            const bounds = quill.getBounds(atIndex);
            if (bounds) {
              const editorRect = quill.container.getBoundingClientRect();
              setMentionDialogPosition({
                top: bounds.bottom + editorRect.top + window.scrollY,
                left: bounds.left + editorRect.left + window.scrollX,
              });
            }

            return;
          }
        }

        // If we didn't find a valid mention, close the dialog
        if (mentionState.isActive) {
          setMentionState({ isActive: false, query: '', startIndex: 0 });
        }
      }, 0);
    };

    const handleSelectionChange = () => {
      const selection = quill.getSelection();
      if (!selection) return;

      const cursorPosition = selection.index;
      const text = quill.getText();

      // Find the last @ before cursor position
      let atIndex = -1;
      for (let i = cursorPosition - 1; i >= 0; i--) {
        if (text[i] === '@') {
          atIndex = i;
          break;
        }
        // Stop searching if we hit a newline or go too far
        if (text[i] === '\n' || cursorPosition - i > 50) {
          break;
        }
      }

      // Check if we found an @ and it's at a valid position
      if (atIndex !== -1) {
        // Check if @ is at beginning or after whitespace/newline
        const charBefore = atIndex > 0 ? text[atIndex - 1] : '\n';
        const isValidPosition = charBefore === '\n' || charBefore === ' ' || charBefore === '\t';

        if (isValidPosition) {
          // Extract the query (text between @ and cursor)
          const query = text.substring(atIndex + 1, cursorPosition);

          // Check if query contains whitespace (which means mention should close)
          if (query.includes(' ') || query.includes('\n')) {
            setMentionState({ isActive: false, query: '', startIndex: 0 });
            return;
          }

          // Update mention state
          setMentionState({
            isActive: true,
            query: query,
            startIndex: atIndex,
          });

          // Calculate dialog position
          const bounds = quill.getBounds(atIndex);
          if (bounds) {
            const editorRect = quill.container.getBoundingClientRect();
            setMentionDialogPosition({
              top: bounds.bottom + editorRect.top + window.scrollY,
              left: bounds.left + editorRect.left + window.scrollX,
            });
          }

          return;
        }
      }

      // If we didn't find a valid mention, close the dialog
      if (mentionState.isActive) {
        setMentionState({ isActive: false, query: '', startIndex: 0 });
      }
    };

    quill.on('text-change', handleTextChange);
    quill.on('selection-change', handleSelectionChange);

    return () => {
      quill.off('text-change', handleTextChange);
      quill.off('selection-change', handleSelectionChange);
    };
  }, [quill, mode, mentionState.isActive, collaborators.length]);

  // Handle quick reply shortcut detection (/ trigger) - only in reply mode
  useEffect(() => {
    if (!quill || mode !== 'reply') {
      // Close shortcut dialog if not in reply mode
      if (shortcutState.isActive) {
        setShortcutState({ isActive: false, query: '', startIndex: 0 });
        setShowQuickRepliesDialog(false);
      }
      return;
    }

    const handleTextChange = () => {
      // Use setTimeout to ensure selection is updated after text change
      setTimeout(() => {
        const selection = quill.getSelection();
        if (!selection) return;

        const cursorPosition = selection.index;
        const text = quill.getText();

        // Find the last / before or at cursor position
        let slashIndex = -1;
        for (let i = cursorPosition - 1; i >= 0; i--) {
          if (text[i] === '/') {
            slashIndex = i;
            break;
          }
          // Stop searching if we hit a space, newline or go too far
          if (text[i] === ' ' || text[i] === '\n' || cursorPosition - i > 50) {
            break;
          }
        }

        // Check if we found a / and it's at a valid position
        if (slashIndex !== -1) {
          // Check if / is at beginning or after whitespace/newline
          const charBefore = slashIndex > 0 ? text[slashIndex - 1] : '\n';
          const isValidPosition = charBefore === '\n' || charBefore === ' ' || charBefore === '\t';

          if (isValidPosition) {
            // Extract the query (text between / and cursor)
            const query = text.substring(slashIndex, cursorPosition);

            // Check if query contains whitespace (which means shortcut dialog should close)
            if (query.includes(' ') || query.includes('\n')) {
              setShortcutState({ isActive: false, query: '', startIndex: 0 });
              setShowQuickRepliesDialog(false);
              return;
            }

            // Update shortcut state and open dialog
            setShortcutState({
              isActive: true,
              query: query,
              startIndex: slashIndex,
            });
            setShowQuickRepliesDialog(true);

            return;
          }
        }

        // If we didn't find a valid shortcut, close the dialog if it was triggered by slash
        if (shortcutState.isActive) {
          setShortcutState({ isActive: false, query: '', startIndex: 0 });
          setShowQuickRepliesDialog(false);
        }
      }, 0);
    };

    const handleSelectionChange = () => {
      const selection = quill.getSelection();
      if (!selection) return;

      const cursorPosition = selection.index;
      const text = quill.getText();

      // Find the last / before cursor position
      let slashIndex = -1;
      for (let i = cursorPosition - 1; i >= 0; i--) {
        if (text[i] === '/') {
          slashIndex = i;
          break;
        }
        // Stop searching if we hit a space, newline or go too far
        if (text[i] === ' ' || text[i] === '\n' || cursorPosition - i > 50) {
          break;
        }
      }

      // If cursor moved away from active shortcut, close dialog
      if (shortcutState.isActive) {
        if (slashIndex === -1 || slashIndex !== shortcutState.startIndex) {
          setShortcutState({ isActive: false, query: '', startIndex: 0 });
          setShowQuickRepliesDialog(false);
        }
      }
    };

    quill.on('text-change', handleTextChange);
    quill.on('selection-change', handleSelectionChange);

    return () => {
      quill.off('text-change', handleTextChange);
      quill.off('selection-change', handleSelectionChange);
    };
  }, [quill, mode, shortcutState.isActive, shortcutState.startIndex]);

  // Handle send button click
  const handleSendClick = useCallback(() => {
    // Allow sending if: not disabled OR (disabled but mode is 'note')
    const canSend = !disabled || mode === 'note';
    if (quill && canSend) {
      const text = quill.getText().trim();
      const hasPendingImage = pendingImageAttachmentRef.current !== null;

      if (text || hasPendingImage) {
        const html = quill.root.innerHTML;
        const whatsappMessage = text ? htmlToWhatsappFormat(html) : '';

        onSend(whatsappMessage, mode);
        quill.setText('');
        onChangeRef.current('');

        // Clear mentions after sending
        setMentions([]);
      }
    }
  }, [quill, disabled, onSend, mode]);

  // Handle AI option selection
  const handleAIOptionSelect = useCallback(
    async (optionId: string) => {
      if (!quill || !projectName) return;

      // Get current message text
      const text = quill.getText().trim();

      // Close the dialog
      setShowAIDialog(false);

      // Handle "Ask AI" option separately (opens modal)
      if (optionId === 'ask-ai') {
        setShowAskAIModal(true);
        return;
      }

      // For other options, ensure there's text to transform
      if (!text) {
        console.warn('[MessageInput] No text to transform');
        return;
      }

      setIsAIProcessing(true);

      try {
        let response: { text: string };

        switch (optionId) {
          case 'friendly':
            response = await api.makeFriendly(projectName, text);
            break;
          case 'formal':
            response = await api.makeFormal(projectName, text);
            break;
          case 'fix-grammar':
            response = await api.fixGrammar(projectName, text);
            break;
          default:
            console.warn('[MessageInput] Unknown AI option:', optionId);
            return;
        }

        // Replace the text in the editor with the AI response
        if (response?.text) {
          quill.setText(response.text);
          onChangeRef.current(response.text);
          // Move cursor to the end
          quill.setSelection(response.text.length, 0);
        }
      } catch (error) {
        console.error('[MessageInput] AI processing error:', error);
        // TODO: Show error toast to user
      } finally {
        setIsAIProcessing(false);
      }
    },
    [quill, projectName, onChangeRef]
  );

  // Handle Ask AI modal question
  const handleAskAI = useCallback(
    async (question: string): Promise<string> => {
      if (!projectName) {
        throw new Error('Project name is required');
      }

      const response = await api.answerQuestion(projectName, question);
      return response.text;
    },
    [projectName]
  );

  // Handle sending AI answer to input
  const handleSendAIAnswerToInput = useCallback(
    (answer: string) => {
      if (!quill) return;

      // Get current text
      const currentText = quill.getText().trim();

      // Append the answer to the current text
      const newText = currentText ? `${currentText}\n\n${answer}` : answer;

      // Set the new text
      quill.setText(newText);
      onChangeRef.current(newText);

      // Move cursor to the end
      quill.setSelection(newText.length, 0);

      // Focus the editor
      quill.focus();
    },
    [quill, onChangeRef]
  );

  // Handle voice recording completion
  const handleVoiceRecordingComplete = useCallback(
    async (audioBlob: Blob) => {
      const fileName = `voice-note-${Date.now()}.m4a`;

      try {
        // Upload the audio file to Firebase and send as media
        await onVoiceNoteUpload(audioBlob, fileName);
      } catch (error) {
        console.error('[MessageInput] Failed to upload voice note:', error);
      }

      // Exit voice recording mode
      setIsRecordingVoice(false);
    },
    [onVoiceNoteUpload]
  );

  // Handle mention selection
  const handleMentionSelect = useCallback(
    (collaborator: Collaborator) => {
      if (!quill || !mentionState.isActive) return;

      const selection = quill.getSelection();
      if (!selection) return;

      const cursorPosition = selection.index;
      const mentionTextWithoutSpace = `@${collaborator.name}`;

      // Delete from @ to cursor (including the @ and any query text)
      const deleteLength = cursorPosition - mentionState.startIndex;
      quill.deleteText(mentionState.startIndex, deleteLength);

      // Insert the mention text with bold formatting
      quill.insertText(mentionState.startIndex, mentionTextWithoutSpace, { bold: true });

      // Insert non-breaking space as a separate operation to ensure it's visible
      // Regular spaces at the end are collapsed by Quill, so we use non-breaking space
      const spacePosition = mentionState.startIndex + mentionTextWithoutSpace.length;
      quill.insertText(spacePosition, '\u00A0'); // Non-breaking space

      // Set cursor after the mention and space
      const newCursorPosition = spacePosition + 1; // After the space
      quill.setSelection(newCursorPosition, 0);

      // Remove bold formatting for subsequent text
      quill.format('bold', false);

      // Store the mention metadata (excluding the trailing space)
      const newMention: Mention = {
        name: collaborator.name,
        email: collaborator.email,
        startIndex: mentionState.startIndex,
        endIndex: spacePosition, // End at the space position (before the space)
      };

      setMentions((prev) => [...prev, newMention]);

      // Close the mention dialog
      setMentionState({ isActive: false, query: '', startIndex: 0 });

      // Focus the editor so user can keep typing
      quill.focus();

      // Double-check focus after a short delay
      setTimeout(() => {
        const hasFocus = quill.hasFocus();
        if (!hasFocus) {
          quill.focus();
        }
      }, 100);
    },
    [quill, mentionState]
  );

  // Handle emoji selection
  const handleEmojiClick = useCallback(
    (emojiData: EmojiClickData) => {
      // Allow emoji insertion if: not disabled OR (disabled but mode is 'note')
      const canInsert = !disabled || mode === 'note';
      if (quill && canInsert) {
        const selection = quill.getSelection();
        // If no selection, insert at the end but account for Quill's trailing newline
        const cursorPosition = selection ? selection.index : Math.max(0, quill.getLength() - 1);
        quill.insertText(cursorPosition, emojiData.emoji);
        quill.setSelection(cursorPosition + emojiData.emoji.length, 0);
        setShowEmojiPicker(false);
      }
    },
    [quill, disabled, mode]
  );

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Close AI dialog when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (aiDialogRef.current && !aiDialogRef.current.contains(event.target as Node)) {
        setShowAIDialog(false);
      }
    };

    if (showAIDialog) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAIDialog]);

  // Handle Ask AI question from message dropdown
  useEffect(() => {
    if (askAIQuestion) {
      // Store the question in local state before clearing parent state
      setCurrentAIQuestion(askAIQuestion);
      // Open the Ask AI modal - it will automatically call the API
      setShowAskAIModal(true);

      // Notify parent that we handled the question
      if (onAskAIQuestionHandled) {
        onAskAIQuestionHandled();
      }
    }
  }, [askAIQuestion, onAskAIQuestionHandled]);

  return (
    <div className={`relative ${className}`}>
      {/* Mention Dialog - for @ tagging teammates (only in note mode) */}
      {mentionState.isActive && mode === 'note' && (
        <div className="absolute bottom-full left-0 right-0 mb-0 z-[100]">
          <MentionDialog
            collaborators={collaborators}
            query={mentionState.query}
            onSelect={handleMentionSelect}
            onClose={() => setMentionState({ isActive: false, query: '', startIndex: 0 })}
            position={mentionDialogPosition}
          />
        </div>
      )}

      {/* Emoji Picker - positioned outside to avoid clipping */}
      {showEmojiPicker && (
        <div ref={emojiPickerRef} className="absolute bottom-full left-0 right-0 mb-0 z-[100]">
          <div className="w-full">
            <EmojiPicker
              onEmojiClick={handleEmojiClick}
              width="100%"
              theme={resolvedTheme === 'dark' ? Theme.DARK : Theme.LIGHT}
            />
          </div>
        </div>
      )}

      {/* AI Dialog - positioned above input box */}
      {showAIDialog && (
        <div ref={aiDialogRef} className="absolute bottom-full left-0 right-0 mb-0 z-[100]">
          <AIDialog onSelect={handleAIOptionSelect} onClose={() => setShowAIDialog(false)} />
        </div>
      )}

      {/* Attachment Menu - positioned above action buttons, left-aligned */}
      {showAttachmentMenu && (
        <div ref={attachmentMenuRef} className="absolute bottom-full left-2 mb-1 z-[100]">
          <AttachmentMenu
            onSelectVoiceNote={() => {
              setShowAttachmentMenu(false);
              setIsRecordingVoice(true);
            }}
            onSelectDocument={() => {
              setShowAttachmentMenu(false);
              onAttachmentClick();
            }}
            onClose={() => setShowAttachmentMenu(false)}
          />
        </div>
      )}

      {/* Ask AI Modal */}
      <AskAIModal
        isOpen={showAskAIModal}
        onClose={() => {
          setShowAskAIModal(false);
          setCurrentAIQuestion(null);
        }}
        onAsk={handleAskAI}
        onSendToInput={handleSendAIAnswerToInput}
        initialQuestion={currentAIQuestion}
        autoTrigger={!!currentAIQuestion}
      />

      {/* Voice Recorder - replaces the entire input when recording */}
      {isRecordingVoice && (
        <VoiceRecorder
          onRecordingComplete={handleVoiceRecordingComplete}
          onCancel={() => setIsRecordingVoice(false)}
        />
      )}

      {/* Normal input UI - hidden (not unmounted) when recording voice to preserve Quill state */}
      <div className={isRecordingVoice ? 'hidden' : ''}>
        {/* Bot active / Assignee indicator / 24-hour rule warning */}
        {disabled && (
          <div
            className={`ml-3 mr-2 text-xs font-medium px-2 py-1 rounded-t-md w-fit cursor-default ${
              disabledByAI
                ? 'text-foreground bg-ring'
                : disabledBy24HourRule
                  ? 'text-white bg-orange-500'
                  : 'text-gray-700 bg-gray-300'
            }`}
          >
            {disabledByAI
              ? t('Bot active')
              : disabledBy24HourRule
                ? t('More than 24 hours have passed since the last user message')
                : `${assigneeName} ${t('is assigned')}`}
          </div>
        )}

        <div
          ref={inputContainerRef}
          style={{ paddingBottom: 'var(--padding-bottom-safe-extra)' }}
          className={`bg-background rounded-t-md border border-b-0 z-20 overflow-hidden bottom-0 flex flex-col ${
            disabled
              ? disabledByAI
                ? 'm-0 mt-0 border-ring border-2 border-b-0'
                : disabledBy24HourRule
                  ? 'm-0 mt-0 border-orange-500 border-2 border-b-0'
                  : 'm-0 mt-0 border-muted-foreground border-2 border-b-0'
              : 'm-0'
          }`}
        >
          {/* Slot: Input toolbar - for formatting buttons, templates, etc. */}
          <Slot name="message-input-toolbar" />

          {/* Custom Toolbar with Lucide Icons */}
          <div className="flex items-center justify-between px-2 py-1 border-b border-ring">
            <div className="flex items-center gap-1">
              <Button
                onClick={() => handleFormat('bold')}
                variant="ghost"
                className="cursor-pointer p-0! w-[28px] h-[28px]"
                disabled={isEditorDisabled}
                title="Bold"
              >
                <Bold size={16} />
              </Button>
              <Button
                onClick={() => handleFormat('italic')}
                variant="ghost"
                className="cursor-pointer p-0! w-[28px] h-[28px]"
                disabled={isEditorDisabled}
                title="Italic"
              >
                <Italic size={16} />
              </Button>
              <Button
                onClick={() => handleFormat('strike')}
                variant="ghost"
                className="cursor-pointer p-0! w-[28px] h-[28px]"
                disabled={isEditorDisabled}
                title="Strikethrough"
              >
                <Strikethrough size={16} />
              </Button>
              <div className="w-px h-5 bg-ring mx-1" />
              <Button
                onClick={() => handleFormat('list', 'ordered')}
                variant="ghost"
                className="cursor-pointer p-0! w-[28px] h-[28px]"
                disabled={isEditorDisabled}
                title="Numbered List"
              >
                <ListOrdered size={16} />
              </Button>
              <Button
                onClick={() => handleFormat('list', 'bullet')}
                variant="ghost"
                className="cursor-pointer p-0! w-[28px] h-[28px]"
                disabled={isEditorDisabled}
                title="Bullet List"
              >
                <List size={16} />
              </Button>
            </div>

            <div className="flex items-center gap-1">
              {/* Mode selector: Note or Reply - Always enabled */}
              <div className="inline-flex gap-1 dark:gap-0.5 rounded-sm border bg-muted/50 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('note')}
                  className={`cursor-pointer inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors border border-transparent ${
                    mode === 'note'
                      ? 'bg-popover dark:bg-input text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-card'
                  }`}
                >
                  <NotepadText size={14} strokeWidth={2} />
                  {t('Note')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('reply')}
                  className={`cursor-pointer inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors border border-transparent ${
                    mode === 'reply'
                      ? 'bg-popover dark:bg-input text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-card'
                  }`}
                >
                  <MessageCircle size={14} strokeWidth={2} />
                  {t('Reply')}
                </button>
              </div>
            </div>
          </div>

          {/* Editor and controls */}
          <div className="flex items-end gap-2">
            {/* Quill Editor */}
            <div className="flex-1 relative">
              <div
                className={`quill-editor-wrapper rounded-md bg-background text-foreground placeholder-foreground ${isEditorDisabled || isAIProcessing ? '!cursor-default [&_*]:!cursor-default' : ''}`}
              >
                <div className="[&_.ql-blank::before]:text-muted-foreground! border-0!" ref={quillRef} />
              </div>

              {/* AI Processing Overlay */}
              {isAIProcessing && (
                <div className="absolute inset-0 bg-background/80 flex items-end justify-center pb-3 rounded-md z-10">
                  <Spinner size="small" />
                </div>
              )}
            </div>
          </div>

          {/* Pending image preview - shown between editor and action buttons */}
          {pendingImageAttachment && (
            <PendingImagePreview
              imageUrl={pendingImageAttachment.previewUrl}
              fileName={pendingImageAttachment.fileName}
              onRemove={clearPendingImageAttachment}
            />
          )}

          <div className="w-full flex justify-between items-end px-2 py-2">
            {/* Action buttons */}

            <div className="flex items-center gap-1">
              {mode === 'reply' &&
                (disabled || pendingImageAttachment ? (
                  <Button
                    variant="ghost"
                    onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                    className={`${iconContainerClassname} rounded-md shrink-0`}
                    disabled={disabled || !!pendingImageAttachment}
                  >
                    <Paperclip
                      strokeWidth={iconStrokeWidth}
                      size={msgInputIconSize}
                      className={iconClassname}
                    />
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger render={<div />}>
                      <Button
                        variant="ghost"
                        onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                        className={`${iconContainerClassname} rounded-md shrink-0`}
                      >
                        <Paperclip
                          strokeWidth={iconStrokeWidth}
                          size={msgInputIconSize}
                          className={iconClassname}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('Attachments')}</TooltipContent>
                  </Tooltip>
                ))}

              {isEditorDisabled ? (
                <Button
                  ref={emojiButtonRef}
                  variant="ghost"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className={`${iconContainerClassname} rounded-full shrink-0`}
                  disabled={isEditorDisabled}
                >
                  <Smile strokeWidth={iconStrokeWidth} size={msgInputIconSize} className={iconClassname} />
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger render={<div />}>
                    <Button
                      ref={emojiButtonRef}
                      variant="ghost"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`${iconContainerClassname} rounded-full shrink-0`}
                    >
                      <Smile
                        strokeWidth={iconStrokeWidth}
                        size={msgInputIconSize}
                        className={iconClassname}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('Emojis')}</TooltipContent>
                </Tooltip>
              )}

              {mode === 'reply' && (
                <>
                  {disabled ? (
                    <Button
                      variant="ghost"
                      onClick={() => setShowAIDialog(!showAIDialog)}
                      className={`${iconContainerClassname} rounded-md shrink-0`}
                      disabled={disabled}
                    >
                      <Sparkles
                        strokeWidth={iconStrokeWidth}
                        size={msgInputIconSize}
                        className={iconClassname}
                      />
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger render={<div />}>
                        <Button
                          variant="ghost"
                          onClick={() => setShowAIDialog(!showAIDialog)}
                          className={`${iconContainerClassname} rounded-md shrink-0`}
                        >
                          <Sparkles
                            strokeWidth={iconStrokeWidth}
                            size={msgInputIconSize}
                            className={iconClassname}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('Artificial Intelligence')}</TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center">
              <Button
                onClick={handleSendClick}
                className={`${iconContainerClassname} rounded-md shrink-0`}
                type="submit"
                disabled={
                  isEditorDisabled || ((!value || value.trim().length === 0) && !pendingImageAttachment)
                }
              >
                <SendHorizontal strokeWidth={2.5} size={msgInputIconSize} className={iconClassname} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

MessageInput.displayName = 'MessageInput';
MessageInputInner.displayName = 'MessageInputInner';
