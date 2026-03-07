import type { LanguageModel, ModelMessage, Tool, ToolChoice, ToolSet } from 'ai';

export interface ToolModelConfig {
  model: LanguageModel;
  temperature: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  messages: ModelMessage[];
  providerOptions: {
    openai: {
      store: boolean;
    };
  };
  tools?: Record<string, Tool>;
  toolChoice?: ToolChoice<NoInfer<ToolSet>>;
  responseFormat?: { type: 'json' };
  seed?: number;
}

export interface ParsedResult {
  nextNodeID: string;
  messageToUser?: string;
}
