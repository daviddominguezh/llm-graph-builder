import { describe, expect, it, jest } from '@jest/globals';

interface RpcResult {
  data: number | null;
  error: { code: string; message: string } | null;
}

const mockRpc = jest.fn<(fn: string, args: Record<string, unknown>) => Promise<RpcResult>>();

jest.unstable_mockModule('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({ rpc: mockRpc }),
}));

const { createClient } = await import('@supabase/supabase-js');
const { publishVersion, publishAgentVersion } = await import('../versionQueries.js');

function makeClient(): ReturnType<typeof createClient> {
  return createClient('https://fake.supabase.co', 'fake-key');
}

const FIRST_VERSION = 1;
const NEW_VERSION = 7;

describe('publishVersion', () => {
  it('calls publish_version_tx RPC with the agent id and returns the new version', async () => {
    mockRpc.mockResolvedValueOnce({ data: NEW_VERSION, error: null });

    const result = await publishVersion(makeClient(), 'agent-1');

    expect(result).toBe(NEW_VERSION);
    expect(mockRpc).toHaveBeenCalledWith('publish_version_tx', { p_agent_id: 'agent-1' });
  });

  it('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'X', message: 'boom' } });

    await expect(publishVersion(makeClient(), 'agent-1')).rejects.toThrow('boom');
  });
});

describe('publishAgentVersion', () => {
  it('calls publish_agent_version_tx RPC with the agent id and returns the new version', async () => {
    mockRpc.mockResolvedValueOnce({ data: FIRST_VERSION, error: null });

    const result = await publishAgentVersion(makeClient(), 'agent-1');

    expect(result).toBe(FIRST_VERSION);
    expect(mockRpc).toHaveBeenCalledWith('publish_agent_version_tx', { p_agent_id: 'agent-1' });
  });

  it('throws when the RPC returns an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'X', message: 'denied' } });

    await expect(publishAgentVersion(makeClient(), 'agent-1')).rejects.toThrow('denied');
  });
});
