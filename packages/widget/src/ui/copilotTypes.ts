export interface CopilotTextBlock {
  type: 'text';
  content: string;
}

export interface CopilotActionBlock {
  type: 'action';
  icon: string;
  title: string;
  description: string;
}

// UI-only: never persisted or produced by BlockCoalescer.
// Injected at render time to signal "agent is working".
export interface CopilotThinkingBlock {
  type: 'thinking';
}

export type CopilotMessageBlock = CopilotTextBlock | CopilotActionBlock | CopilotThinkingBlock;

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  blocks: CopilotMessageBlock[];
  timestamp: number;
}

export interface CopilotSession {
  id: string;
  title: string;
  messages: CopilotMessage[];
  createdAt: number;
}

export interface CopilotPersistedState {
  sessions: CopilotSession[];
  activeSessionId: string | null;
}
