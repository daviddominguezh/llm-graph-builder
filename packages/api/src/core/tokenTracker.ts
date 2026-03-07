import type { TokenLog } from '@src/types/ai/index.js';

const INITIAL_TOKEN_COUNT = 0;

/**
 * Creates a new empty token log
 */
export const createEmptyTokenLog = (): TokenLog => ({
  input: INITIAL_TOKEN_COUNT,
  output: INITIAL_TOKEN_COUNT,
  cached: INITIAL_TOKEN_COUNT,
});

/**
 * Accumulates tokens from source into target by mutating target in place
 */
export const accumulateTokens = (target: TokenLog, source: TokenLog): void => {
  Object.assign(target, {
    input: target.input + source.input,
    output: target.output + source.output,
    cached: target.cached + source.cached,
  });
};

/**
 * Creates a copy of a token log
 */
export const cloneTokenLog = (tokens: TokenLog): TokenLog => ({
  input: tokens.input,
  output: tokens.output,
  cached: tokens.cached,
});
