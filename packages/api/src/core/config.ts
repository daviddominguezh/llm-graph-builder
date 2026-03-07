import type { LanguageModel, ModelMessage, Tool, ToolChoice, ToolSet } from 'ai';

import type { ToolModelConfig } from '@src/types/ai/index.js';

const DEFAULT_TEMPERATURE = 0;

interface GetConfigParams {
  model: LanguageModel;
  cleanMessages: ModelMessage[];
  tools?: Record<string, Tool>;
  toolChoice?: ToolChoice<NoInfer<ToolSet>>;
  kind?: string;
}

export const getConfig = (params: GetConfigParams): ToolModelConfig => {
  const { model, cleanMessages, tools, toolChoice, kind } = params;

  const config: ToolModelConfig = {
    model,
    temperature: DEFAULT_TEMPERATURE,
    messages: cleanMessages,
    providerOptions: {
      openai: {
        store: true,
      },
    },
  };

  // Force JSON mode for agent_decision nodes to prevent plain text responses
  if (kind === 'agent_decision') {
    config.responseFormat = { type: 'json' };
  }

  if (tools !== undefined) {
    config.tools = tools;
  }
  if (toolChoice !== undefined) {
    config.toolChoice = toolChoice;
  }

  return config;
};
