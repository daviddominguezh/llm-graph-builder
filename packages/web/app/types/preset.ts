export interface ContextPreset {
  id: string;
  name: string;
  sessionID: string;
  tenantID: string;
  userID: string;
  data: Record<string, unknown>;
  quickReplies: Record<string, string>;
}

export const DEFAULT_PRESET: ContextPreset = {
  id: 'default',
  name: 'Default',
  sessionID: 'session-1',
  tenantID: 'tenant-1',
  userID: 'user-1',
  data: {},
  quickReplies: {},
};
