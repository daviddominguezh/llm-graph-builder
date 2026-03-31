import React from 'react';
import { Provider } from 'react-redux';

import { store } from '@/app/components/messages/store/mainStore';

import { ChatProvider, AIProvider, MessageProvider, UIProvider } from '../../core/contexts';
import { SlotProvider } from '../../core/slots';
import { FeatureRegistry } from '../../core/registry';
import { featureConfig } from '../../featureConfig';
import { MessagesDashboardLayout } from './MessagesDashboardLayout';

interface MessagesDashboardContainerProps {
  onChangeSidebar: (val: boolean) => void;
  initialChatFilter?: string;
}

/**
 * MessagesDashboardContainer
 *
 * Container component that wraps the messages dashboard with all necessary providers.
 *
 * Architecture (Provider Order - CRITICAL for context dependencies):
 * - FeatureRegistry: Manages and renders enabled features
 * - SlotProvider: Provides slot system for UI extension points
 * - ChatProvider: Base layer - manages chat selection and conversation state
 * - AIProvider: Uses ChatContext - manages AI/chatbot state
 * - MessageProvider: Uses ChatContext + AIContext - handles message sending
 * - UIProvider: Uses ChatContext - manages UI state (modals, sidebar, search)
 * - MessagesDashboardLayout: Uses all contexts for rendering
 */
export const MessagesDashboardContainer: React.FC<MessagesDashboardContainerProps> = ({
  onChangeSidebar,
  initialChatFilter,
}) => {
  return (
    <Provider store={store}>
      <FeatureRegistry config={featureConfig}>
        <SlotProvider>
          <ChatProvider>
            <AIProvider>
              <MessageProvider>
                <UIProvider>
                  <MessagesDashboardLayout onChangeSidebar={onChangeSidebar} initialChatFilter={initialChatFilter} />
                </UIProvider>
              </MessageProvider>
            </AIProvider>
          </ChatProvider>
        </SlotProvider>
      </FeatureRegistry>
    </Provider>
  );
};

MessagesDashboardContainer.displayName = 'MessagesDashboardContainer';
