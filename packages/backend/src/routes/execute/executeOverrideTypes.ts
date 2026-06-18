/**
 * Config override for dynamically created child agents (create_agent tool).
 * These have no published agent version — their config is passed inline via the
 * dispatch path (see executeCoreInlineDispatch.ts).
 */
export interface OverrideAgentConfig {
  systemPrompt: string;
  context: string;
  maxSteps: number | null;
  modelId?: string;
  isChildAgent?: boolean;
}
