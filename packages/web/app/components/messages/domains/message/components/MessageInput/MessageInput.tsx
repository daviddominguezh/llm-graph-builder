/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuill } from 'react-quilljs';
import { useParams } from 'react-router-dom';

import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import {
  Bold,
  Handbag,
  Italic,
  List,
  ListOrdered,
  MessageCircle,
  NotepadText,
  Paperclip,
  SendHorizontal,
  ShoppingCart,
  Smile,
  Sparkles,
  Store,
  Strikethrough,
  Zap,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import * as api from '@services/api';

import { useOrders } from '@hooks/useOrders';
import { useShoppingCart } from '@hooks/useShoppingCart';

import { replaceVariables } from '@features/chatSettings/quickRepliesUtils';
import { BusinessSetup, Product } from '@features/discountTest';
import { useUserInfo } from '@features/messagesDashboard/hooks/useUserInfo';

import Spinner from '@components/spinner';
import { Button } from '@components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';

import { useIsMobile } from '@globalUtils/device';
import { loadQuill } from '@globalUtils/quillWrapper';
import { formatPhone, htmlToWhatsappFormat } from '@globalUtils/strs';

import type { MediaFileDetailList } from '@globalTypes/media';
import { MediaStatus } from '@globalTypes/media';
import type { Collaborator } from '@globalTypes/projectInnerSettings';

import { useChat } from '../../../../core/contexts/ChatContext';
import { useMessage } from '../../../../core/contexts/MessageContext';
import { Slot } from '../../../../core/slots';
import { useMessageRepository } from '../../../../hooks/useMessageRepository';
import { AIDialog } from './AIDialog';
import { AskAIModal } from './AskAIModal';
import { AttachmentMenu } from './AttachmentMenu';
import { MentionDialog } from './MentionDialog';
import './MessageInput.css';
import { OrdersDialog } from './OrdersDialog';
import { PendingImagePreview } from './PendingImagePreview';
import { ProductsDialog } from './ProductsDialog';
import { QuickRepliesDialog } from './QuickRepliesDialog';
import { ShoppingCartDialog } from './ShoppingCartDialog';
import { VoiceRecorder } from './VoiceRecorder';
import type { Mention, MentionState, PendingImageAttachment } from './types';
import { createProductCardsStr } from './utils';

import 'quill/dist/quill.snow.css';

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
  const [isQuillLoaded, setIsQuillLoaded] = useState(false);
  const { t } = useTranslation();

  // Pre-load Quill before react-quilljs tries to use it
  // This ensures Quill is available via ES modules in production builds
  useEffect(() => {
    loadQuill()
      .then(() => {
        setIsQuillLoaded(true);
      })
      .catch((error) => {
        console.error('[MessageInput] Failed to load Quill:', error);
      });
  }, []);

  // Show loading state while Quill is being loaded
  if (!isQuillLoaded) {
    return (
      <div className={`relative ${props.className || ''}`}>
        <div className="bg-white rounded-t-md border border-b-0 z-20 overflow-hidden bottom-0 flex flex-col m-0">
          <div className="p-4 text-gray-400 text-sm text-center">{t('Loading editor...')}</div>
        </div>
      </div>
    );
  }

  // Only render the actual component once Quill is loaded
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
  const { t } = useTranslation();
  const { projectName } = useParams<{ projectName: string }>();
  const {
    businessInfo,
    businessInfoLoading,
    activeChat,
    isTestChatActive,
    refetchBusinessInfo,
    availableQuickReplies,
  } = useChat();
  const { handleMediaUpload, handleSendMessageUIOnly, pendingImageAttachment, clearPendingImageAttachment } =
    useMessage();
  const repository = useMessageRepository();

  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showProductsDialog, setShowProductsDialog] = useState(false);
  const [showShoppingCartDialog, setShowShoppingCartDialog] = useState(false);
  const [showOrdersDialog, setShowOrdersDialog] = useState(false);
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
  const productsDialogRef = useRef<HTMLDivElement>(null);
  const shoppingCartDialogRef = useRef<HTMLDivElement>(null);
  const ordersDialogRef = useRef<HTMLDivElement>(null);
  const aiDialogRef = useRef<HTMLDivElement>(null);
  const quickRepliesDialogRef = useRef<HTMLDivElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const msgInputIconSize = isMobile ? 20 : 20;
  const iconContainerClassname = isMobile ? 'w-10! h-10!' : 'w-8! h-8!';
  const iconClassname = isMobile ? 'w-5! h-5!' : 'w-4! h-4!';
  const iconStrokeWidth = 2;

  // Shopping cart hook - use activeChat as userID
  const {
    cart,
    loading: cartLoading,
    refreshCart,
    addItem,
    removeItem,
  } = useShoppingCart(projectName || '', activeChat || '');

  // Orders hook - use activeChat as userID
  const { orders, loading: ordersLoading, refreshOrders } = useOrders(projectName || '', activeChat || '');

  // User info hook - get customer data
  const userInfo = useUserInfo(activeChat, true);

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

  // Quill configuration - disable toolbar, we'll use custom
  // Memoize modules to prevent recreation on every render
  const modules = useMemo(
    () => ({
      toolbar: false,
      keyboard: {
        bindings: {
          enter: {
            key: 'Enter',
            handler: function (this: { quill: any }) {
              // Don't send message if Quick Replies dialog is open
              if (showQuickRepliesDialogRef.current) {
                return false; // Prevent default Enter behavior
              }

              // Allow sending if: not disabled OR (disabled but mode is 'note')
              const canSend = !disabled || modeRef.current === 'note';
              if (canSend) {
                const quill = this.quill;
                const text = quill.getText().trim();
                const hasPendingImage = pendingImageAttachmentRef.current !== null;

                if (text || hasPendingImage) {
                  const html = quill.root.innerHTML;
                  const whatsappMessage = text ? htmlToWhatsappFormat(html) : '';

                  onSendRef.current(whatsappMessage, modeRef.current);
                  quill.setText('');
                  onChange('');
                  // Clear mentions after sending
                  setMentions([]);
                }
              }
              return false; // Prevent default Enter behavior
            },
          },
          'shift-enter': {
            key: 'Enter',
            shiftKey: true,
            handler: () => {
              // Allow Shift+Enter to create new line
              return true;
            },
          },
        },
      },
    }),
    [disabled, onChange]
  );

  const { quill, quillRef } = useQuill({
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

  // Sync Quill content with external value changes (e.g., chat switching)
  useEffect(() => {
    if (quill) {
      const currentText = quill.getText().trim();
      const newValue = value.trim();

      // Only update if the value is different from what's in the editor
      // This prevents interference with user typing
      if (currentText !== newValue) {
        if (newValue === '') {
          quill.setText('');
        } else {
          // For now, we'll just set plain text
          // In the future, we could store HTML and restore formatting
          quill.setText(newValue);
        }
      }
    }
  }, [quill, value]);

  // Handle text changes
  useEffect(() => {
    if (quill) {
      const handler = () => {
        const text = quill.getText();
        onChange(text);
      };

      quill.on('text-change', handler);

      // Disable/enable based on isEditorDisabled (disabled AND mode is 'reply')
      quill.enable(!isEditorDisabled);

      return () => {
        quill.off('text-change', handler);
      };
    }
  }, [quill, onChange, isEditorDisabled]);

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
        onChange('');

        // Clear mentions after sending
        setMentions([]);
      }
    }
  }, [quill, disabled, onSend, onChange, mode]);

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
          onChange(response.text);
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
    [quill, projectName, onChange]
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
      onChange(newText);

      // Move cursor to the end
      quill.setSelection(newText.length, 0);

      // Focus the editor
      quill.focus();
    },
    [quill, onChange]
  );

  // Handle quick reply selection
  const handleQuickReplySelect = useCallback(
    (quickReply: { text: string }) => {
      if (!quill) return;

      // Format user phone by removing "whatsapp:" prefix and formatting
      let formattedUserPhone = activeChat || '';
      if (formattedUserPhone.startsWith('whatsapp:')) {
        const phoneWithoutPrefix = formattedUserPhone.replace('whatsapp:', '');
        const formatted = formatPhone(phoneWithoutPrefix);
        formattedUserPhone = formatted || phoneWithoutPrefix;
      }

      // Replace variables in the text
      const processedText = replaceVariables(quickReply.text, {
        userName: userInfo?.name || '',
        userEmail: userInfo?.email || '',
        userNIC: userInfo?.nic || '',
        userAddress:
          userInfo?.address ||
          (userInfo?.addressSchema
            ? `${userInfo.addressSchema.direccion}, ${userInfo.addressSchema.barrio}, ${userInfo.addressSchema.cityName}`
            : ''),
        userPhone: formattedUserPhone,
        businessName: businessInfo?.info?.businessName || '',
        businessDescription: businessInfo?.info?.businessDescription || '',
        businessAddress: businessInfo?.info?.address || '',
      });

      // If triggered by slash, replace the slash trigger text
      if (shortcutState.isActive) {
        const selection = quill.getSelection();
        const cursorPosition = selection ? selection.index : quill.getLength() - 1;

        // Calculate the length of text to delete (from / to cursor)
        const deleteLength = cursorPosition - shortcutState.startIndex;

        // Delete the slash trigger text (e.g., "/hi")
        quill.deleteText(shortcutState.startIndex, deleteLength);

        // Insert the quick reply text at the slash position
        quill.insertText(shortcutState.startIndex, processedText);

        // Move cursor to the end of inserted text
        quill.setSelection(shortcutState.startIndex + processedText.length, 0);

        // Reset shortcut state
        setShortcutState({ isActive: false, query: '', startIndex: 0 });
      } else {
        // Normal insertion at cursor position
        const selection = quill.getSelection();
        const cursorPosition = selection ? selection.index : quill.getLength() - 1;

        // Insert the quick reply text at cursor position
        quill.insertText(cursorPosition, processedText);

        // Move cursor to the end of inserted text
        quill.setSelection(cursorPosition + processedText.length, 0);
      }

      // Update the onChange handler
      onChange(quill.getText());

      // Close the dialog
      setShowQuickRepliesDialog(false);

      // Focus the editor
      quill.focus();
    },
    [quill, activeChat, userInfo, businessInfo, onChange, shortcutState]
  );

  // Handle order created from shopping cart
  const handleOrderCreated = useCallback(() => {
    // Refresh orders list when a new order is created
    refreshOrders();
  }, [refreshOrders]);

  // Handle payment link from shopping cart
  const handlePaymentLinkCreated = useCallback(
    (paymentLink: string) => {
      if (!quill) return;

      const currentText = quill.getText().trim();
      const newText = currentText ? `${currentText}\n\n${paymentLink}` : paymentLink;

      // Set the new text
      quill.setText(newText);
      onChange(newText);

      // Move cursor to the end
      quill.setSelection(newText.length, 0);

      // Focus the editor
      quill.focus();
    },
    [quill, onChange]
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

  // Handle send product card from ProductsDialog
  const handleSendProductCard = useCallback(
    async (productId: string, selectedImageId: string | null) => {
      // Find the product from business info
      const product: Product | undefined = businessInfo?.products?.products.find(
        (prod) => prod.id === productId
      );

      if (!product) {
        console.error('[MessageInput] Product not found:', productId);
        return;
      }

      // Close the products dialog immediately for instant feedback
      setShowProductsDialog(false);

      // Determine which image to send
      let imageToSend = null;
      if (selectedImageId) {
        // Use the selected image
        imageToSend = product.media?.find((m) => m.id === selectedImageId);
      } else if (product.media && product.media.length > 0) {
        // Use the first image if none is selected
        imageToSend = product.media[0];
      }

      // Create the product card message string (with stock-based filtering)
      const messageStr = createProductCardsStr(
        product,
        selectedImageId ?? undefined,
        (businessInfo ?? undefined) as BusinessSetup | undefined
      );

      // Generate message ID for the text message
      const textMessageId = uuidv4();

      // Handle image and text backend sending
      if (imageToSend?.url) {
        const mediaFiles: MediaFileDetailList = {
          [imageToSend.id]: {
            id: imageToSend.id,
            name: product.name,
            link: imageToSend.url,
            kind: 'image' as any, // Using 'image' as the kind for product images
            status: MediaStatus.READY,
          },
        };

        // Send image first (appears in UI immediately via handleMediaUpload, sends to backend)
        handleMediaUpload(mediaFiles).catch((error) => {
          console.error('[MessageInput] Failed to send product image:', error);
        });

        // Show text message in UI immediately after image (optimistic update)
        handleSendMessageUIOnly(messageStr, textMessageId);

        // Wait 5 seconds then send text to backend (already showing in UI)
        setTimeout(() => {
          if (activeChat && projectName) {
            repository
              .sendMessage(projectName, activeChat, messageStr, 'text', textMessageId, isTestChatActive)
              .catch((error) => {
                console.error('[MessageInput] Failed to send product card text:', error);
              });
          }
        }, 5000);
      } else {
        // No image, show text in UI and send to backend immediately
        handleSendMessageUIOnly(messageStr, textMessageId);

        if (activeChat && projectName) {
          repository
            .sendMessage(projectName, activeChat, messageStr, 'text', textMessageId, isTestChatActive)
            .catch((error) => {
              console.error('[MessageInput] Failed to send product card text:', error);
            });
        }
      }
    },
    [
      businessInfo,
      handleMediaUpload,
      handleSendMessageUIOnly,
      activeChat,
      projectName,
      isTestChatActive,
      repository,
    ]
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

  // Close products dialog when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productsDialogRef.current && !productsDialogRef.current.contains(event.target as Node)) {
        setShowProductsDialog(false);
      }
    };

    if (showProductsDialog) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProductsDialog]);

  // Close shopping cart dialog when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Don't close if clicking inside the shopping cart dialog
      if (shoppingCartDialogRef.current && shoppingCartDialogRef.current.contains(target)) {
        return;
      }

      // Don't close if clicking on a modal/dialog (check for dialog elements or high z-index overlays)
      const clickedElement = event.target as HTMLElement;
      const isClickingOnModal =
        clickedElement.closest('[role="dialog"]') ||
        clickedElement.closest('[data-radix-portal]') ||
        clickedElement.closest('.tw\\:z-\\[150\\]');

      if (isClickingOnModal) {
        return;
      }

      setShowShoppingCartDialog(false);
    };

    if (showShoppingCartDialog) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showShoppingCartDialog]);

  // Close orders dialog when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Don't close if clicking inside the orders dialog
      if (ordersDialogRef.current && ordersDialogRef.current.contains(target)) {
        return;
      }

      // Don't close if clicking on a modal/dialog (check for dialog elements or high z-index overlays)
      const clickedElement = event.target as HTMLElement;
      const isClickingOnModal =
        clickedElement.closest('[role="dialog"]') ||
        clickedElement.closest('[data-radix-portal]') ||
        clickedElement.closest('.tw\\:z-\\[150\\]');

      if (isClickingOnModal) {
        return;
      }

      setShowOrdersDialog(false);
    };

    if (showOrdersDialog) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOrdersDialog]);

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
        <div
          ref={emojiPickerRef}
          className="absolute bottom-full left-0 right-0 mb-0 z-[100]"
        >
          <div className="w-full">
            <EmojiPicker onEmojiClick={handleEmojiClick} width="100%" />
          </div>
        </div>
      )}

      {/* Products Dialog - positioned above input box */}
      {showProductsDialog && (
        <div
          ref={productsDialogRef}
          className="absolute bottom-full left-0 right-0 z-[100]"
          style={{
            height: '65vh',
          }}
        >
          <ProductsDialog
            businessInfo={businessInfo}
            businessInfoLoading={businessInfoLoading}
            projectName={projectName || ''}
            onClose={() => setShowProductsDialog(false)}
            onSendProductCard={handleSendProductCard}
            onRefresh={refetchBusinessInfo}
          />
        </div>
      )}

      {/* Shopping Cart Dialog - positioned above input box */}
      {showShoppingCartDialog && (
        <div
          ref={shoppingCartDialogRef}
          className="absolute bottom-full left-0 right-0 z-[100]"
          style={{
            height: '65vh',
          }}
        >
          <ShoppingCartDialog
            cart={cart}
            loading={cartLoading}
            businessInfo={businessInfo}
            projectName={projectName || ''}
            userID={activeChat || ''}
            customerName={userInfo?.name || ''}
            customerEmail={userInfo?.email || ''}
            customerPhone={activeChat || ''}
            customerNationalId={userInfo?.nic || ''}
            customerAddress={userInfo?.addressSchema}
            onClose={() => setShowShoppingCartDialog(false)}
            onRefresh={refreshCart}
            onAddItem={addItem}
            onRemoveItem={removeItem}
            onOrderCreated={handleOrderCreated}
            onPaymentLinkCreated={handlePaymentLinkCreated}
          />
        </div>
      )}

      {/* Orders Dialog - positioned above input box */}
      {showOrdersDialog && (
        <div
          ref={ordersDialogRef}
          className="absolute bottom-full left-0 right-0 z-[100]"
          style={{
            height: '65vh',
          }}
        >
          <OrdersDialog
            orders={orders}
            loading={ordersLoading}
            businessInfo={businessInfo}
            projectName={projectName || ''}
            userID={activeChat || ''}
            onClose={() => setShowOrdersDialog(false)}
            onRefresh={refreshOrders}
          />
        </div>
      )}

      {/* Quick Replies Dialog - positioned above input box */}
      {showQuickRepliesDialog && (
        <div
          ref={quickRepliesDialogRef}
          className="absolute bottom-full left-0 right-0 z-[100] mb-0"
          style={{
            height: '60vh',
          }}
        >
          <QuickRepliesDialog
            quickReplies={availableQuickReplies}
            onSelect={handleQuickReplySelect}
            onClose={() => {
              setShowQuickRepliesDialog(false);
              setShortcutState({ isActive: false, query: '', startIndex: 0 });
            }}
            shortcutQuery={shortcutState.isActive ? shortcutState.query : undefined}
          />
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
            className={`ml-3 mr-2 text-xs font-medium px-2 py-1 rounded-t-md w-fit ${
              disabledByAI
                ? 'text-white bg-black'
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
          className={`bg-white rounded-t-md border border-b-0 z-20 overflow-hidden bottom-0 flex flex-col ${
            disabled
              ? disabledByAI
                ? 'm-0 mt-0 border-black border-2 border-b-0'
                : disabledBy24HourRule
                  ? 'm-0 mt-0 border-orange-500 border-2 border-b-0'
                  : 'm-0 mt-0 border-gray-400 border-2 border-b-0'
              : 'm-0'
          }`}
        >
          {/* Slot: Input toolbar - for formatting buttons, templates, etc. */}
          <Slot name="message-input-toolbar" />

          {/* Custom Toolbar with Lucide Icons */}
          <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200">
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
              <div className="w-px h-5 bg-gray-300 mx-1" />
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
              <div className="flex items-center bg-gray-100 rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setMode('note')}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all text-sm cursor-pointer ${
                    mode === 'note'
                      ? 'bg-white text-yellow-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <NotepadText size={16} strokeWidth={2} />
                  {mode === 'note' && <span className="font-medium">{t('Note')}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('reply')}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all text-sm cursor-pointer ${
                    mode === 'reply'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <MessageCircle size={16} strokeWidth={2} />
                  {mode === 'reply' && <span className="font-medium">{t('Reply')}</span>}
                </button>
              </div>
            </div>
          </div>

          {/* Editor and controls */}
          <div className="flex items-end gap-2">
            {/* Quill Editor */}
            <div className="flex-1 relative">
              <div
                className={`quill-editor-wrapper rounded-md bg-white ${isEditorDisabled || isAIProcessing ? '!cursor-default [&_*]:!cursor-default' : ''}`}
              >
                <div ref={quillRef} />
              </div>

              {/* AI Processing Overlay */}
              {isAIProcessing && (
                <div className="absolute inset-0 bg-white/80 flex items-end justify-center pb-3 rounded-md z-10">
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
                    <TooltipTrigger asChild>
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
                  className={`${iconContainerClassname} rounded-md shrink-0`}
                  disabled={isEditorDisabled}
                >
                  <Smile strokeWidth={iconStrokeWidth} size={msgInputIconSize} className={iconClassname} />
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      ref={emojiButtonRef}
                      variant="ghost"
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`${iconContainerClassname} rounded-md shrink-0`}
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
                      onClick={() => setShowProductsDialog(!showProductsDialog)}
                      className={`${iconContainerClassname} rounded-md shrink-0`}
                      disabled={disabled}
                    >
                      <Store
                        strokeWidth={iconStrokeWidth}
                        size={msgInputIconSize}
                        className={iconClassname}
                      />
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          onClick={() => setShowProductsDialog(!showProductsDialog)}
                          className={`${iconContainerClassname} rounded-md shrink-0`}
                        >
                          <Store
                            strokeWidth={iconStrokeWidth}
                            size={msgInputIconSize}
                            className={iconClassname}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('Products')}</TooltipContent>
                    </Tooltip>
                  )}

                  {disabled ? (
                    <Button
                      variant="ghost"
                      onClick={() => setShowShoppingCartDialog(!showShoppingCartDialog)}
                      className={`${iconContainerClassname} rounded-md shrink-0`}
                      disabled={disabled}
                    >
                      <ShoppingCart
                        strokeWidth={iconStrokeWidth}
                        size={msgInputIconSize}
                        className={iconClassname}
                      />
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          onClick={() => setShowShoppingCartDialog(!showShoppingCartDialog)}
                          className={`${iconContainerClassname} rounded-md shrink-0`}
                        >
                          <ShoppingCart
                            strokeWidth={iconStrokeWidth}
                            size={msgInputIconSize}
                            className={iconClassname}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('Shopping Cart')}</TooltipContent>
                    </Tooltip>
                  )}

                  {disabled ? (
                    <Button
                      variant="ghost"
                      onClick={() => setShowOrdersDialog(!showOrdersDialog)}
                      className={`${iconContainerClassname} rounded-md shrink-0`}
                      disabled={disabled}
                    >
                      <Handbag
                        strokeWidth={iconStrokeWidth}
                        size={msgInputIconSize}
                        className={iconClassname}
                      />
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          onClick={() => setShowOrdersDialog(!showOrdersDialog)}
                          className={`${iconContainerClassname} rounded-md shrink-0`}
                        >
                          <Handbag
                            strokeWidth={iconStrokeWidth}
                            size={msgInputIconSize}
                            className={iconClassname}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('Orders')}</TooltipContent>
                    </Tooltip>
                  )}

                  {disabled ? (
                    <Button
                      variant="ghost"
                      onClick={() => {}}
                      className={`${iconContainerClassname} rounded-md shrink-0`}
                      disabled={disabled}
                    >
                      <Zap strokeWidth={iconStrokeWidth} size={msgInputIconSize} className={iconClassname} />
                    </Button>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            // Close slash-triggered state if active
                            if (shortcutState.isActive) {
                              setShortcutState({ isActive: false, query: '', startIndex: 0 });
                            }
                            setShowQuickRepliesDialog(!showQuickRepliesDialog);
                          }}
                          className={`${iconContainerClassname} rounded-md shrink-0`}
                        >
                          <Zap
                            strokeWidth={iconStrokeWidth}
                            size={msgInputIconSize}
                            className={iconClassname}
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('Quick Replies')}</TooltipContent>
                    </Tooltip>
                  )}

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
                      <TooltipTrigger asChild>
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
