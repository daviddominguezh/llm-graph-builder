import type { CopilotMessageBlock } from './copilotTypes';

const MOCK_RESPONSES: CopilotMessageBlock[][] = [
  [
    { type: 'text', content: 'I can help you set up a refund handling flow. Let me suggest a structure:' },
    {
      type: 'action',
      icon: 'plus-circle',
      title: 'Add node: Refund Handler',
      description: 'An agent node that processes refund requests and validates eligibility.',
    },
    { type: 'text', content: 'You can then connect it from your main router with an agent_decision edge.' },
  ],
  [
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
  [
    {
      type: 'text',
      content:
        'To integrate an external API, you should use a tool_call edge. This lets the agent invoke the tool and wait for the result before proceeding to the next node.',
    },
  ],
  [
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
];

let mockIndex = 0;

export function getNextMockResponse(): CopilotMessageBlock[] {
  const response = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length]!;
  mockIndex++;
  return response;
}
