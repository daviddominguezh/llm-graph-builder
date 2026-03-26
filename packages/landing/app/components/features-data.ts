import { Activity, Network, Plug, Sparkles, Terminal, Workflow } from 'lucide-react';
import type { ComponentType } from 'react';

export interface Feature {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

export const FEATURES: Feature[] = [
  {
    title: 'Multi-Tenant I/O Layer',
    description:
      'Connect WhatsApp, Instagram, Slack, Telegram, or a web chatbot — per tenant. Isolated channels, conversation history, and data.',
    icon: Network,
  },
  {
    title: 'Build Any Agent in Minutes',
    description: 'Design agents visually with our builder. No code required. Vibe coding for agents.',
    icon: Workflow,
  },
  {
    title: 'Any LLM, Any Provider',
    description: 'Powered by OpenRouter. Use OpenAI, Anthropic, Google, Mistral, Meta — no lock-in.',
    icon: Sparkles,
  },
  {
    title: 'Tools via MCP',
    description: 'Create or install MCP servers directly from the visual builder. No glue code.',
    icon: Plug,
  },
  {
    title: 'Observability Built In',
    description: 'Cost tracking, full message history, step-by-step traces, filtering, dashboards.',
    icon: Activity,
  },
  {
    title: 'API-First Execution',
    description: 'Deploy any agent as an API endpoint. Call it from anywhere.',
    icon: Terminal,
  },
];
