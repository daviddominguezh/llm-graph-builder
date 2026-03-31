/* ------------------------------------------------------------------ */
/*  DB row types for agent_vfs_configs                                */
/* ------------------------------------------------------------------ */

export interface AgentVfsConfigRow {
  id: number;
  agent_id: string;
  org_id: string;
  installation_id: number;
  repo_id: number;
  repo_full_name: string;
  created_at: string;
  updated_at: string;
}

/** Extended row from RPC JOIN with github_installations + repo existence check */
export interface VfsConfigWithInstallation extends AgentVfsConfigRow {
  installation_status: 'active' | 'suspended' | 'revoked';
  account_name: string;
  repo_exists: boolean;
}

/** Input for upsert operations */
export interface VfsConfigUpsertInput {
  agentId: string;
  orgId: string;
  installationId: number;
  repoId: number;
  repoFullName: string;
}

/** VFS runtime settings stored on agents.vfs_settings */
export interface AgentVfsSettings {
  enabled: boolean;
  protectedPaths?: string[];
  searchCandidateLimit?: number;
  readLineCeiling?: number;
  rateLimitThreshold?: number;
}
