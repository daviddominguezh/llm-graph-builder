import React, { createContext, useContext, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useMessageRepository } from '../../hooks/useMessageRepository';
import { useChat } from './ChatContext';
import { TEST_PHONE } from '@/app/constants/messages';

interface AIContextValue {
  // AI state
  isAIEnabled: boolean;
  setIsAIEnabled: (enabled: boolean) => void;

  // Node selection
  selectedNode: string;
  setSelectedNode: (node: string) => void;
  isNodeSelectionModalOpen: boolean;
  openNodeSelectionModal: () => void;
  closeNodeSelectionModal: () => void;
  confirmNode: () => Promise<void>;

  // AI toggle
  toggleAI: (enabled: boolean) => Promise<void>;

  // Inquiry handling
  inquiryResponse: string;
  setInquiryResponse: (response: string) => void;
  isInquiryModalOpen: boolean;
  openInquiryModal: () => void;
  closeInquiryModal: () => void;
  inquiryLoading: boolean;
  resolveInquiry: () => Promise<void>;
}

const AIContext = createContext<AIContextValue | undefined>(undefined);

interface AIProviderProps {
  children: React.ReactNode;
}

export const AIProvider: React.FC<AIProviderProps> = ({ children }) => {
  const { projectName } = useParams();
  const repository = useMessageRepository();

  // Import useChat to get activeChat and currentChat
  // Note: This creates a dependency on ChatContext, so AIProvider must be nested inside ChatProvider
  const { activeChat, currentChat } = useChat();

  // AI state
  const [isAIEnabled, setIsAIEnabled] = useState(false);

  // Node selection state
  const [selectedNode, setSelectedNode] = useState('');
  const [isNodeSelectionModalOpen, setIsNodeSelectionModalOpen] = useState(false);

  // Inquiry state
  const [inquiryResponse, setInquiryResponse] = useState('');
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [inquiryLoading, setInquiryLoading] = useState(false);

  // Sync AI enabled state from currentChat
  React.useEffect(() => {
    // Always disable AI for test chat
    if (activeChat === TEST_PHONE) {
      setIsAIEnabled(false);
    } else if (currentChat?.enabled !== undefined) {
      setIsAIEnabled(currentChat.enabled);
    }
  }, [currentChat?.enabled, activeChat]);

  const openNodeSelectionModal = useCallback(() => {
    setIsNodeSelectionModalOpen(true);
  }, []);

  const closeNodeSelectionModal = useCallback(() => {
    setIsNodeSelectionModalOpen(false);
    setSelectedNode('');
  }, []);

  const toggleAI = useCallback(
    async (enabled: boolean) => {
      if (!activeChat || !currentChat) return;

      // Prevent any AI toggle for test chat (no API calls)
      if (activeChat === TEST_PHONE) {
        return;
      }

      if (enabled) {
        // When turning ON, show the node selection modal
        setSelectedNode('');
        setIsNodeSelectionModalOpen(true);
      } else {
        // When turning OFF, directly call the API
        await repository.toggleAI(projectName || '', activeChat, false, currentChat);
        setIsAIEnabled(false);
      }
    },
    [projectName, activeChat, currentChat, repository]
  );

  const confirmNode = useCallback(async () => {
    if (!selectedNode || !currentChat || !activeChat) return;

    // Prevent API calls for test chat
    if (activeChat === TEST_PHONE) {
      setIsNodeSelectionModalOpen(false);
      setSelectedNode('');
      return;
    }

    // Call API with the selected node to enable AI
    await repository.toggleAI(projectName || '', activeChat, true, currentChat, selectedNode);
    setIsAIEnabled(true);
    setIsNodeSelectionModalOpen(false);
    setSelectedNode('');
  }, [selectedNode, currentChat, activeChat, projectName, repository]);

  const openInquiryModal = useCallback(() => {
    setIsInquiryModalOpen(true);
  }, []);

  const closeInquiryModal = useCallback(() => {
    setIsInquiryModalOpen(false);
    setInquiryResponse('');
  }, []);

  const resolveInquiry = useCallback(async () => {
    if (!activeChat || !inquiryResponse) return;

    setInquiryLoading(true);
    try {
      // Find the message with inquiry flag
      // This logic will be enhanced when we have access to messages from context
      const messageId = inquiryResponse; // Placeholder - will be replaced
      await repository.fixInquiry(projectName || '', activeChat, messageId);
      setIsInquiryModalOpen(false);
      setInquiryResponse('');
    } catch (error) {
      console.error('Failed to resolve inquiry:', error);
      throw error;
    } finally {
      setInquiryLoading(false);
    }
  }, [activeChat, inquiryResponse, projectName, repository]);

  const value: AIContextValue = {
    isAIEnabled,
    setIsAIEnabled,
    selectedNode,
    setSelectedNode,
    isNodeSelectionModalOpen,
    openNodeSelectionModal,
    closeNodeSelectionModal,
    confirmNode,
    toggleAI,
    inquiryResponse,
    setInquiryResponse,
    isInquiryModalOpen,
    openInquiryModal,
    closeInquiryModal,
    inquiryLoading,
    resolveInquiry,
  };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
};

export const useAI = (): AIContextValue => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within AIProvider');
  }
  return context;
};
