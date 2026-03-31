import type { ModelMessage } from 'ai';

import type { ActionTokenUsage, TokenLog } from '@src/types/ai/logs.js';
import type { Message } from '@src/types/ai/messages.js';

import type { AgentLoopConfig, AgentLoopResult, AgentToolCallRecord } from './agentLoopTypes.js';
import { AGENT_LOOP_HARD_LIMIT } from './agentLoopTypes.js';
import { buildSkillsPromptSuffix } from './skillTool.js';

const ZERO = 0;

export function resolveMaxSteps(config: AgentLoopConfig): number {
  if (config.maxSteps === null) return AGENT_LOOP_HARD_LIMIT;
  return Math.min(config.maxSteps, AGENT_LOOP_HARD_LIMIT);
}

export function buildSystemMessage(config: AgentLoopConfig): ModelMessage {
  let combined = config.context !== '' ? `${config.systemPrompt}\n\n${config.context}` : config.systemPrompt;
  if (config.skills !== undefined && config.skills.length > ZERO) {
    combined += buildSkillsPromptSuffix(config.skills);
  }
  return { role: 'system', content: combined };
}

export function buildInitialMessages(config: AgentLoopConfig): ModelMessage[] {
  const system = buildSystemMessage(config);
  const history = config.messages.map((m) => m.message);
  return [system, ...history];
}

export function createEmptyTokens(): TokenLog {
  return { input: ZERO, output: ZERO, cached: ZERO };
}

export function accumulateTokens(target: TokenLog, source: TokenLog): void {
  target.input += source.input;
  target.output += source.output;
  target.cached += source.cached;
  target.costUSD = (target.costUSD ?? ZERO) + (source.costUSD ?? ZERO);
}

export function buildLoopResult(
  finalText: string,
  step: number,
  totalTokens: TokenLog,
  tokensLogs: ActionTokenUsage[],
  allToolCalls: AgentToolCallRecord[]
): AgentLoopResult {
  return { finalText, steps: step, totalTokens, tokensLogs, toolCalls: allToolCalls };
}
