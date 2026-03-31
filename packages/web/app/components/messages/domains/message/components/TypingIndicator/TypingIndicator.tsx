import React from 'react';

import './TypingIndicator.css';

/**
 * TypingIndicator component displays an animated typing indicator
 * Used to show that a message is being sent in test chat mode
 */
interface TypingIndicatorProps {
  className?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ className = '' }) => {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 ${className}`}>
      <div className="flex items-center gap-1 bg-[#f3f7fe] rounded-lg px-3 py-2">
        <div className="typing-indicator-dots">
          <span className="typing-indicator-dot" />
          <span className="typing-indicator-dot" />
          <span className="typing-indicator-dot" />
        </div>
      </div>
    </div>
  );
};

TypingIndicator.displayName = 'TypingIndicator';
