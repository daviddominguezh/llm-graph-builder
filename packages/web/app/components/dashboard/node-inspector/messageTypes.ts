/* ─── AI SDK message content types ─── */

interface TextPart {
  type: 'text';
  text: string;
}

interface ReasoningPart {
  type: 'reasoning';
  text: string;
}

interface ToolCallPart {
  type: 'tool-call';
  toolCallId?: string;
  toolName: string;
  args: unknown;
}

interface ToolResultPart {
  type: 'tool-result';
  toolCallId?: string;
  toolName: string;
  result?: unknown;
  output?: unknown;
}

export type ContentPart = TextPart | ReasoningPart | ToolCallPart | ToolResultPart;

export interface RawMessage {
  role: string;
  content: string | ContentPart[];
}

/* ─── Parsed card types ─── */

export interface UserCard {
  kind: 'user';
  text: string;
}

export interface SystemCard {
  kind: 'system';
  text: string;
}

export interface AssistantTextCard {
  kind: 'assistant';
  text: string;
}

export interface ReasoningCard {
  kind: 'reasoning';
  text: string;
}

export interface ToolCallCard {
  kind: 'tool-call';
  toolName: string;
  args: unknown;
}

export interface ToolResultCard {
  kind: 'tool-result';
  toolName: string;
  result: unknown;
}

export type MessageCard =
  | UserCard
  | SystemCard
  | AssistantTextCard
  | ReasoningCard
  | ToolCallCard
  | ToolResultCard;
