import { NONNEGATIVE_DEFAULT } from '@src/constants/index.js';
import type { TokenLog } from '@src/types/ai/index.js';

interface LanguageModelTokenUsage {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cachedInputTokens?: number | undefined;
  costUSD?: number | undefined;
}

interface EmbeddingTokenUsage {
  tokens: number;
}

export const getTokensUsage = (usage: LanguageModelTokenUsage | EmbeddingTokenUsage): TokenLog => {
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
    costUSD: usage.costUSD,
  };
};
