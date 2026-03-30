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
    const config = { ...BASE_CONFIG, maxSteps: 10 };
    expect(resolveMaxSteps(config)).toBe(10);
  });

  it('caps at hard limit', () => {
    const config = { ...BASE_CONFIG, maxSteps: 999 };
    expect(resolveMaxSteps(config)).toBe(AGENT_LOOP_HARD_LIMIT);
  });
});

describe('buildInitialMessages', () => {
  it('creates system message with prompt and context', () => {
    const msgs = buildInitialMessages(BASE_CONFIG);
    expect(msgs[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.\n\nUser likes cats.',
    });
  });

  it('uses prompt only when context is empty', () => {
    const config = { ...BASE_CONFIG, context: '' };
    const msgs = buildInitialMessages(config);
    expect(msgs[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
  });
});

describe('createEmptyTokens', () => {
  it('returns zeroed token log', () => {
    const tokens = createEmptyTokens();
    expect(tokens).toEqual({ input: 0, output: 0, cached: 0 });
  });
});

describe('accumulateTokens', () => {
  it('adds source into target', () => {
    const target = { input: 10, output: 5, cached: 2 };
    const source = { input: 3, output: 7, cached: 1, costUSD: 0.01 };
    accumulateTokens(target, source);
    expect(target).toEqual({ input: 13, output: 12, cached: 3, costUSD: 0.01 });
  });
});

describe('buildLoopResult', () => {
  it('assembles result correctly', () => {
    const tokens = { input: 100, output: 50, cached: 10 };
    const result = buildLoopResult('done', 3, tokens, [], []);
    expect(result.finalText).toBe('done');
    expect(result.steps).toBe(3);
    expect(result.totalTokens).toEqual(tokens);
  });
});
