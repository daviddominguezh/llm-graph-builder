export interface MockTextBlock {
  type: 'text';
  content: string;
}

export interface MockActionBlock {
  type: 'action';
  icon: string;
  title: string;
  description: string;
}

export type MockBlock = MockTextBlock | MockActionBlock;

export interface MockEntry {
  blocks: MockBlock[];
}

// Ported verbatim from packages/web/app/components/copilot/copilotMocks.ts.
// Keep content identical so the widget sees the same strings.
export const mockCatalog: MockEntry[] = [
  {
    blocks: [
      { type: 'text', content: 'I can help you set up a refund handling flow. Let me suggest a structure:' },
      {
        type: 'action',
        icon: 'plus-circle',
        title: 'Add node: Refund Handler',
        description: 'An agent node that processes refund requests and validates eligibility.',
      },
      { type: 'text', content: 'You can then connect it from your main router with an agent_decision edge.' },
    ],
  },
  {
    blocks: [
      {
        type: 'text',
        content:
          "Looking at your graph, I notice the checkout node has no error handling path. I'd recommend adding a fallback:",
      },
      {
        type: 'action',
        icon: 'git-branch',
        title: 'Add edge: Error fallback',
        description: 'A user_reply edge from Checkout to Error Handler for failed transactions.',
      },
    ],
  },
  {
    blocks: [
      {
        type: 'text',
        content:
          'To integrate an external API, you should use a tool_call edge. This lets the agent invoke the tool and wait for the result before proceeding to the next node.',
      },
    ],
  },
  {
    blocks: [
      { type: 'text', content: "Great question! Here's how I'd restructure that flow:" },
      {
        type: 'action',
        icon: 'plus-circle',
        title: 'Add node: Intent Classifier',
        description: 'An agent_decision node that routes user requests to the appropriate handler.',
      },
      {
        type: 'action',
        icon: 'plus-circle',
        title: 'Add node: FAQ Responder',
        description: 'An agent node that handles common questions using a knowledge base tool.',
      },
      {
        type: 'text',
        content:
          'Connect the Intent Classifier to each handler with agent_decision edges, using descriptive labels so the LLM knows when to route there.',
      },
    ],
  },
];

// Classic 31-multiplier string hash (djb2-adjacent); the final `| 0` truncates to Int32.
const HASH_PRIME = 31;
const INT32_TRUNCATE = 0;
const HASH_START = 0;
const HASH_FIRST = 0;
const HASH_STEP = 1;

function hashToIndex(sessionId: string, mod: number): number {
  let h = HASH_START;
  for (let i = HASH_FIRST; i < sessionId.length; i += HASH_STEP) {
    h = (h * HASH_PRIME + sessionId.charCodeAt(i)) | INT32_TRUNCATE;
  }
  return ((h % mod) + mod) % mod;
}

export function pickMockResponse(sessionId: string): number {
  return hashToIndex(sessionId, mockCatalog.length);
}
