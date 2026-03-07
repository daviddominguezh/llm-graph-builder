import type { EmbeddingModelUsage, LanguageModelUsage } from 'ai';

import { NONNEGATIVE_DEFAULT } from '@src/constants/index.js';
import type { TokenLog } from '@src/types/ai/index.js';

export const getTokensUsage = (usage: LanguageModelUsage | EmbeddingModelUsage): TokenLog => {
  if ('tokens' in usage) {
    return {
      input: usage.tokens,
      output: NONNEGATIVE_DEFAULT,
      cached: NONNEGATIVE_DEFAULT,
    };
  }

  const inputTokens = usage.inputTokens ?? NONNEGATIVE_DEFAULT;
  const cachedInputTokens = usage.cachedInputTokens ?? NONNEGATIVE_DEFAULT;
  const outputTokens = usage.outputTokens ?? NONNEGATIVE_DEFAULT;

  return {
    input: inputTokens - cachedInputTokens,
    output: outputTokens,
    cached: cachedInputTokens,
  };
};
