/* ------------------------------------------------------------------ */
/*  GitHub API response types                                         */
/* ------------------------------------------------------------------ */

export interface GitHubAccount {
  login: string;
  id: number;
  type: 'Organization' | 'User';
}

export interface GitHubInstallationResponse {
  id: number;
  account: GitHubAccount;
  app_id: number;
  target_type: string;
  permissions: Record<string, string>;
  events: string[];
  suspended_at: string | null;
}

export interface GitHubAccessTokenResponse {
  token: string;
  expires_at: string;
  permissions: Record<string, string>;
}

export interface GitHubRepo {
  id: number;
  full_name: string;
  private: boolean;
}

export interface GitHubRepoListResponse {
  total_count: number;
  repositories: GitHubRepo[];
}

/* ------------------------------------------------------------------ */
/*  DB row types                                                       */
/* ------------------------------------------------------------------ */

export interface GitHubInstallationRow {
  installation_id: number;
  org_id: string;
  account_name: string;
  account_type: 'Organization' | 'User';
  status: 'active' | 'suspended' | 'revoked';
  created_at: string;
  updated_at: string;
}

export interface GitHubInstallationRepoRow {
  id: number;
  installation_id: number;
  repo_id: number;
  repo_full_name: string;
  private: boolean;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Webhook payload types                                              */
/* ------------------------------------------------------------------ */

export interface WebhookInstallationPayload {
  action: 'created' | 'deleted' | 'suspend' | 'unsuspend';
  installation: GitHubInstallationResponse;
  repositories?: GitHubRepo[];
}

export interface WebhookInstallationReposPayload {
  action: 'added' | 'removed';
  installation: GitHubInstallationResponse;
  repositories_added: GitHubRepo[];
  repositories_removed: GitHubRepo[];
}

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  webhookSecret: string;
}
