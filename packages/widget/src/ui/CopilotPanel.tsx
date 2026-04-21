import type { CopilotMessage } from './copilotTypes.js';
import { CopilotHeader } from './CopilotHeader.js';
import { CopilotInput } from './CopilotInput.js';
import { CopilotMessages } from './CopilotMessages.js';

export interface CopilotPanelProps {
  standalone?: boolean;
  onClose?: () => void;
}

// Placeholder state — Task 42 replaces with useLiveStreaming wiring.
const EMPTY_MESSAGES: CopilotMessage[] = [];

export function CopilotPanel({ standalone = false, onClose }: CopilotPanelProps) {
  // Task 42 wires useSessions + useLiveStreaming here.
  function handleSend(_text: string) {
    // Task 42 connects to execute + BlockCoalescer.
  }

  return (
    <div className="fixed bottom-[calc((var(--spacing)*6)_-_0px)] top-1.5 right-3.5 z-40 flex w-[400px] flex-col border bg-background rounded-md">
      <CopilotHeader
        sessions={[]}
        activeSession={null}
        onNewChat={() => undefined}
        onSwitchSession={() => undefined}
        onClose={onClose}
        standalone={standalone}
      />
      <CopilotMessages messages={EMPTY_MESSAGES} />
      <CopilotInput onSend={handleSend} isStreaming={false} />
    </div>
  );
}
