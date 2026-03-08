import type { CallAgentOutput, Context } from '@daviddh/llm-graph-runner';
import type { Response } from 'express';

import type { SimulateRequest, SimulationEvent } from '../types.js';

export function writeSSE(res: Response, event: SimulationEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function setSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

export function sumTokens(output: CallAgentOutput): { input: number; output: number; cached: number } {
  let input = 0;
  let outputTokens = 0;
  let cached = 0;
  for (const log of output.tokensLogs) {
    input += log.tokens.input;
    outputTokens += log.tokens.output;
    cached += log.tokens.cached;
  }
  return { input, output: outputTokens, cached };
}

export function buildContext(body: SimulateRequest): Omit<Context, 'toolsOverride' | 'onNodeVisited'> {
  return {
    graph: body.graph,
    apiKey: body.apiKey,
    sessionID: body.sessionID,
    tenantID: body.tenantID,
    userID: body.userID,
    data: body.data,
    quickReplies: body.quickReplies,
  };
}
