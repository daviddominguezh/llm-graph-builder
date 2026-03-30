import type { SupabaseVFSClient } from './types.js';

const THROTTLE_MS = 60_000;
const TABLE = 'vfs_sessions';
const INITIAL_TOUCH_TIME = 0;

interface InitializeParams {
  tenantSlug: string;
  agentSlug: string;
  userID: string;
  sessionId: string;
  commitSha: string;
}

export class SessionTracker {
  private lastTouchTime = INITIAL_TOUCH_TIME;

  constructor(
    private readonly supabase: SupabaseVFSClient,
    private readonly sessionKey: string
  ) {}

  async initialize(params: InitializeParams): Promise<void> {
    const { error } = await this.supabase
      .from(TABLE)
      .upsert(
        {
          session_key: this.sessionKey,
          tenant_slug: params.tenantSlug,
          agent_slug: params.agentSlug,
          user_id: params.userID,
          session_id: params.sessionId,
          commit_sha: params.commitSha,
        },
        { onConflict: 'session_key' }
      )
      .select()
      .single();
    if (error !== null) throw new Error(`Failed to initialize VFS session: ${error.message}`);
    this.lastTouchTime = Date.now();
  }

  async touch(): Promise<void> {
    const now = Date.now();
    if (now - this.lastTouchTime < THROTTLE_MS) return;
    this.lastTouchTime = now;
    await this.supabase
      .from(TABLE)
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('session_key', this.sessionKey);
  }
}
