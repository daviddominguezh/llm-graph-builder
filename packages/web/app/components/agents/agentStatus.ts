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
  draft: 'bg-foreground',
  published: 'bg-green-600 dark:bg-green-500',
  unpublished: 'bg-amber-600 dark:bg-amber-500',
};
