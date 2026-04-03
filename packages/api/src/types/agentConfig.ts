import type { McpServerConfig } from '@daviddh/graph-types';

import type { SkillDefinition } from '@src/agentLoop/agentLoopTypes.js';

export type ContextItem = string;

export interface FewShotExample {
  input: string;
  output: string;
}

/**
 * Unified agent configuration interface.
 *
 * Shared between:
 * - UI agent editor (saved to agent_versions.graph_data)
 * - __system_create_agent tool input schema
 * - Execution layer config resolution
 *
 * When adding new capabilities (VFS, memory, sandboxes),
 * add them here once — all consumers automatically support them.
 */
export interface AgentConfig {
  systemPrompt: string;
  model?: string;
  maxSteps?: number | null;
  contextItems?: ContextItem[];
  mcpServers?: McpServerConfig[];
  skills?: SkillDefinition[];
  fewShotExamples?: FewShotExample[];
  childTimeout?: number; // seconds, default 600
  maxNestingDepth?: number; // default 10
}

export const DEFAULT_CHILD_TIMEOUT_SECONDS = 600;
export const DEFAULT_MAX_NESTING_DEPTH = 10;
