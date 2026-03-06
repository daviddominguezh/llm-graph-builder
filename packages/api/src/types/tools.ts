export interface Context {
  logKey: string;
  businessID: string;
  userID: string;
  namespace: string;
  quickReplies: Record<string, string>;
  isFirstMessage?: boolean;
  currentTime?: string;
  userToken?: string;
}

export interface ToolResponsePrompt {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  result: { result: unknown };
  isError?: boolean;
}

export interface ToolResponse {
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: ToolResponsePrompt;
}
