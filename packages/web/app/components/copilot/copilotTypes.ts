export type CopilotTextBlock = {
  type: 'text';
  content: string;
};

export type CopilotActionBlock = {
  type: 'action';
  icon: string;
  title: string;
  description: string;
};

export type CopilotMessageBlock = CopilotTextBlock | CopilotActionBlock;

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
