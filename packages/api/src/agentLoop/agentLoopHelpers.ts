import type { ModelMessage } from 'ai';

import type { ActionTokenUsage, TokenLog } from '@src/types/ai/logs.js';

import type { AgentLoopConfig, AgentLoopResult, AgentToolCallRecord } from './agentLoopTypes.js';
import { AGENT_LOOP_HARD_LIMIT } from './agentLoopTypes.js';
import { buildSkillsPromptSuffix } from './skillTool.js';

const ZERO = 0;

export function resolveMaxSteps(config: AgentLoopConfig): number {
  if (config.maxSteps === null) return AGENT_LOOP_HARD_LIMIT;
  return Math.min(config.maxSteps, AGENT_LOOP_HARD_LIMIT);
}

const CHILD_AGENT_INSTRUCTIONS = `<system-instructions>
You are a sub-agent dispatched to complete a specific task. When you have fully completed your task, you MUST call the \`__system_finish\` tool with your final output. Do not simply respond with text — always use \`__system_finish\` to signal completion.

If you encountered an error and cannot complete the task, call \`__system_finish\` with status "error" and describe what went wrong in the output.

IMPORTANT: Only call \`__system_finish\` when you are truly done. If you need more information from the user, respond with a text message instead — the user will reply, and you can continue working.
</system-instructions>`;

export function buildSystemMessage(config: AgentLoopConfig): ModelMessage {
  let combined = config.context === '' ? config.systemPrompt : `${config.systemPrompt}\n\n${config.context}`;

  if (config.isChildAgent === true) {
    combined = `${CHILD_AGENT_INSTRUCTIONS}\n\n${combined}\n\n${CHILD_AGENT_INSTRUCTIONS}`;
  }

  if (config.skills !== undefined && config.skills.length > ZERO) {
    combined += buildSkillsPromptSuffix(config.skills);
  }
  return { role: 'system', content: combined };
}

function buildFewShotMessages(
  examples: Array<{ input: string; output: string }> | undefined
): ModelMessage[] {
  if (examples === undefined || examples.length === ZERO) return [];
  const messages: ModelMessage[] = [];
  for (const example of examples) {
    messages.push({ role: 'user', content: example.input });
    messages.push({ role: 'assistant', content: example.output });
  }
  return messages;
}

export function buildInitialMessages(config: AgentLoopConfig): ModelMessage[] {
  const system = buildSystemMessage(config);
  const fewShot = buildFewShotMessages(config.fewShotExamples);
  const history = config.messages.map((m) => m.message);
  return [system, ...fewShot, ...history];
}

export function createEmptyTokens(): TokenLog {
  return { input: ZERO, output: ZERO, cached: ZERO };
}

export function accumulateTokens(target: TokenLog, source: TokenLog): void {
  const updated = { ...target };
  updated.input += source.input;
  updated.output += source.output;
  updated.cached += source.cached;
  updated.costUSD = (updated.costUSD ?? ZERO) + (source.costUSD ?? ZERO);
  Object.assign(target, updated);
}

export interface BuildLoopResultParams {
  finalText: string;
  step: number;
  totalTokens: TokenLog;
  tokensLogs: ActionTokenUsage[];
  allToolCalls: AgentToolCallRecord[];
}

export function buildLoopResult(params: BuildLoopResultParams): AgentLoopResult {
  return {
    finalText: params.finalText,
    steps: params.step,
    totalTokens: params.totalTokens,
    tokensLogs: params.tokensLogs,
    toolCalls: params.allToolCalls,
  };
}
