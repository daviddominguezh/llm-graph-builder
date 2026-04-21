import type { PublicExecutionEvent } from '../execute/executeTypes.js';
import type { MockEntry } from './mockCatalog.js';

const MOCK_NODE_ID = 'mock';
const ZERO_TOKENS = 0;

function* textEvents(content: string): Generator<PublicExecutionEvent> {
  const words = content.split(/(?<ws>\s+)/v);
  for (const chunk of words) {
    if (chunk === '') continue;
    yield { type: 'text', text: chunk, nodeId: MOCK_NODE_ID };
  }
}

function toToolName(title: string): string {
  return title.toLowerCase().replace(/\s+/gv, '_');
}

function* actionEvent(title: string, description: string): Generator<PublicExecutionEvent> {
  yield {
    type: 'toolCall',
    nodeId: MOCK_NODE_ID,
    name: toToolName(title),
    args: { title, description },
    result: { ok: true },
  };
}

export function* toEventSequence(entry: MockEntry): Generator<PublicExecutionEvent> {
  const started = Date.now();
  const combinedText: string[] = [];

  for (const block of entry.blocks) {
    if (block.type === 'text') {
      combinedText.push(block.content);
      yield* textEvents(block.content);
    } else {
      yield* actionEvent(block.title, block.description);
    }
  }

  yield {
    type: 'done',
    response: {
      appType: 'agent',
      text: combinedText.join('\n\n'),
      toolCalls: [],
      tokenUsage: {
        inputTokens: ZERO_TOKENS,
        outputTokens: ZERO_TOKENS,
        cachedTokens: ZERO_TOKENS,
        totalCost: ZERO_TOKENS,
      },
      durationMs: Date.now() - started,
    },
  };
}
