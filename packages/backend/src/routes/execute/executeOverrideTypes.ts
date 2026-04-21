/**
 * Config override for dynamically created child agents (create_agent tool).
 * These have no published agent version — their config is stored in the pending_child_executions row.
 */
export interface OverrideAgentConfig {
  systemPrompt: string;
  context: string;
  maxSteps: number | null;
  modelId?: string;
  isChildAgent?: boolean;
}
