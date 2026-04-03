import React from 'react';

import { MessagesDashboardContainer } from './components/MessagesDashboardContainer';

interface MessagesDashboardProps {
  onChangeSidebar: (val: boolean) => void;
  initialChatFilter?: string;
  tenantId: string;
}

/**
 * MessagesDashboard
 *
 * Main entry point for the messages dashboard feature.
 * This is a lightweight wrapper that delegates to the container component.
 *
 * The refactored architecture follows these principles:
 * - Single Responsibility: Each component has one clear purpose
 * - Separation of Concerns: UI, logic, and data access are separated
 * - Dependency Injection: Repository pattern for testable data access
 * - Composability: Small, focused components that work together
 */
const MessagesDashboard: React.FC<MessagesDashboardProps> = ({ onChangeSidebar, initialChatFilter, tenantId }) => {
  return (
    <MessagesDashboardContainer
      onChangeSidebar={onChangeSidebar}
      initialChatFilter={initialChatFilter}
      tenantId={tenantId}
    />
  );
};

MessagesDashboard.displayName = 'MessagesDashboard';

export default MessagesDashboard;
