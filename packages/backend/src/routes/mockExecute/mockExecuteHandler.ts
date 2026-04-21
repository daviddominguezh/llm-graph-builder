import { setTimeout as sleepMs } from 'node:timers/promises';

import type { Request, Response } from 'express';

import { setSseHeaders, writePublicSSE } from '../execute/executeHelpers.js';
import { AgentExecutionInputSchema } from '../execute/executeTypes.js';
import type { AgentExecutionInput, PublicExecutionEvent } from '../execute/executeTypes.js';
import { mockCatalog, pickMockResponse } from './mockCatalog.js';
import type { MockEntry } from './mockCatalog.js';
import { toEventSequence } from './mockEventStream.js';

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const WORD_CADENCE_MS = 40;

const MOCK_AGENT_SLUG = 'agent-example';
const MOCK_VERSION = '5';

function parseInput(
  req: Request<{ agentSlug: string; version: string }>,
  res: Response
): AgentExecutionInput | null {
  if (req.params.agentSlug !== MOCK_AGENT_SLUG || req.params.version !== MOCK_VERSION) {
    res.status(HTTP_NOT_FOUND).json({ error: 'Mock agent not found' });
    return null;
  }

  const parsed = AgentExecutionInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(HTTP_BAD_REQUEST).json({ error: parsed.error.message });
    return null;
  }
  if (!parsed.data.stream) {
    res.status(HTTP_BAD_REQUEST).json({ error: 'Widget requires stream=true' });
    return null;
  }

  return parsed.data;
}

async function streamEvents(res: Response, entry: MockEntry): Promise<void> {
  const events = [...toEventSequence(entry)];
  await events.reduce<Promise<void>>(async (prev, event: PublicExecutionEvent) => {
    await prev;
    writePublicSSE(res, event);
    if (event.type === 'text') await sleepMs(WORD_CADENCE_MS);
  }, Promise.resolve());
}

export async function handleMockExecute(
  req: Request<{ agentSlug: string; version: string }>,
  res: Response
): Promise<void> {
  const input = parseInput(req, res);
  if (input === null) return;

  const { [pickMockResponse(input.sessionId)]: entry } = mockCatalog;
  if (entry === undefined) return;

  setSseHeaders(res);
  await streamEvents(res, entry);
  res.end();
}
