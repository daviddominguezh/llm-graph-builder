import { describe, expect, it } from '@jest/globals';

import {
  accumulateTokens,
  buildInitialMessages,
  buildLoopResult,
  createEmptyTokens,
  resolveMaxSteps,
} from '../agentLoopHelpers.js';
import { AGENT_LOOP_HARD_LIMIT } from '../agentLoopTypes.js';
import type { AgentLoopConfig } from '../agentLoopTypes.js';

const STEPS_BELOW_LIMIT = 10;
const STEPS_ABOVE_LIMIT = 999;
const ZERO = 0;
const STEPS_THREE = 3;

const BASE_CONFIG: AgentLoopConfig = {
  systemPrompt: 'You are a helpful assistant.',
  context: 'User likes cats.',
  messages: [],
  apiKey: 'key',
  modelId: 'test-model',
  maxSteps: null,
  tools: {},
};

describe('resolveMaxSteps', () => {
  it('returns hard limit when maxSteps is null', () => {
    expect(resolveMaxSteps(BASE_CONFIG)).toBe(AGENT_LOOP_HARD_LIMIT);
  });

  it('returns maxSteps when below hard limit', () => {
    const config = { ...BASE_CONFIG, maxSteps: STEPS_BELOW_LIMIT };
    expect(resolveMaxSteps(config)).toBe(STEPS_BELOW_LIMIT);
  });

  it('caps at hard limit', () => {
    const config = { ...BASE_CONFIG, maxSteps: STEPS_ABOVE_LIMIT };
    expect(resolveMaxSteps(config)).toBe(AGENT_LOOP_HARD_LIMIT);
  });
});

describe('buildInitialMessages', () => {
  it('creates system message with prompt and context', () => {
    const msgs = buildInitialMessages(BASE_CONFIG);
    expect(msgs[ZERO]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.\n\nUser likes cats.',
    });
  });

  it('uses prompt only when context is empty', () => {
    const config = { ...BASE_CONFIG, context: '' };
    const msgs = buildInitialMessages(config);
    expect(msgs[ZERO]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
  });
});

describe('createEmptyTokens', () => {
  it('returns zeroed token log', () => {
    const tokens = createEmptyTokens();
    expect(tokens).toEqual({ input: ZERO, output: ZERO, cached: ZERO });
  });
});

describe('accumulateTokens', () => {
  it('adds source into target', () => {
    const INPUT_A = 10;
    const OUTPUT_A = 5;
    const CACHED_A = 2;
    const INPUT_B = 3;
    const OUTPUT_B = 7;
    const CACHED_B = 1;
    const COST_B = 0.01;
    const EXPECTED_INPUT = 13;
    const EXPECTED_OUTPUT = 12;
    const EXPECTED_CACHED = 3;

    const target = { input: INPUT_A, output: OUTPUT_A, cached: CACHED_A };
    const source = { input: INPUT_B, output: OUTPUT_B, cached: CACHED_B, costUSD: COST_B };
    accumulateTokens(target, source);
    expect(target).toEqual({
      input: EXPECTED_INPUT,
      output: EXPECTED_OUTPUT,
      cached: EXPECTED_CACHED,
      costUSD: COST_B,
    });
  });
});

describe('buildLoopResult', () => {
  it('assembles result correctly', () => {
    const INPUT_TOKENS = 100;
    const OUTPUT_TOKENS = 50;
    const CACHED_TOKENS = 10;
    const tokens = { input: INPUT_TOKENS, output: OUTPUT_TOKENS, cached: CACHED_TOKENS };
    const result = buildLoopResult({
      finalText: 'done',
      step: STEPS_THREE,
      totalTokens: tokens,
      tokensLogs: [],
      allToolCalls: [],
    });
    expect(result.finalText).toBe('done');
    expect(result.steps).toBe(STEPS_THREE);
    expect(result.totalTokens).toEqual(tokens);
  });
});
