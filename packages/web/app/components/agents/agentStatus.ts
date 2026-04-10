export type AgentStatus = 'draft' | 'published' | 'unpublished';

interface AgentStatusInput {
  version: number;
  updated_at: string;
  published_at: string | null;
}

export function getAgentStatus(agent: AgentStatusInput): AgentStatus {
  if (agent.version === 0) return 'draft';
  if (agent.published_at === null) return 'draft';
  if (new Date(agent.updated_at) <= new Date(agent.published_at)) return 'published';
  return 'unpublished';
}

export const STATUS_COLORS: Record<AgentStatus, string> = {
  draft:
    'bg-foreground shadow-[0_0_2px_0px_rgba(0,0,0,0.25)] dark:shadow-[0_0_2px_0px_rgba(255,255,255,0.3)]',
  published:
    'bg-green-600 shadow-[0_0_3px_0px_rgb(22_163_74_/_0.7)] dark:bg-green-500 dark:shadow-[0_0_3px_0px_rgb(34_197_94_/_0.7)]',
  unpublished:
    'bg-amber-600 shadow-[0_0_3px_0px_rgb(217_119_6_/_0.65)] dark:bg-amber-500 dark:shadow-[0_0_3px_0px_rgb(245_158_11_/_0.65)]',
};
