import type { ActionTokenUsage, TokenLog } from '@daviddh/llm-graph-runner';

export interface SimulationToolCall {
  toolName: string;
  input: unknown;
  output: unknown;
}

export interface NodeTokenUsage {
  node: string;
  tokens: TokenLog;
}

export interface SimulationStep {
  userText: string;
  agentText: string;
  visitedNodes: string[];
  toolCalls: SimulationToolCall[];
  nodeTokens: NodeTokenUsage[];
  tokenUsage: TokenLog;
}

export interface NodeResult {
  nodeId: string;
  text: string;
  toolCalls: SimulationToolCall[];
  tokens: TokenLog;
}

export interface SimulationTokens {
  input: number;
  output: number;
  cached: number;
}

export function sumTokensFromLogs(logs: ActionTokenUsage[]): TokenLog {
  let input = 0;
  let output = 0;
  let cached = 0;
  for (const log of logs) {
    input += log.tokens.input;
    output += log.tokens.output;
    cached += log.tokens.cached;
  }
  return { input, output, cached };
}
