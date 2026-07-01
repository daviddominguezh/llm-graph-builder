import { describe, expect, it } from '@jest/globals';

import type { ResolveChildInput, ResolvedChildConfig, SupabaseLike } from '../../capabilities/index.js';
import { makeResolveChildConfig } from '../resolveChildConfig.js';

const stub: ResolvedChildConfig = {
  systemPrompt: 'sp',
  context: 'c',
  modelId: 'm',
  maxSteps: null,
  mcpServers: [],
  skills: [],
  isChildAgent: true,
  task: 'do it',
};

describe('makeResolveChildConfig adapter', () => {
  it('forwards to the injected backend resolver', async () => {
    const resolve = makeResolveChildConfig({}, async () => await Promise.resolve(stub));
    const out = await resolve({ dispatchType: 'invoke_agent', params: {}, orgId: 'o' });
    expect(out).toBe(stub);
  });

  it('passes the injected supabase and input through to the backend resolver', async () => {
    const supabase: SupabaseLike = { marker: 'sb' };
    const input: ResolveChildInput = { dispatchType: 'create_agent', params: {}, orgId: 'org-1' };
    const seen: { sb?: SupabaseLike; inp?: ResolveChildInput } = {};
    const resolve = makeResolveChildConfig(supabase, async (sb, inp) => {
      seen.sb = sb;
      seen.inp = inp;
      return await Promise.resolve(stub);
    });

    const out = await resolve(input);

    expect(seen.sb).toBe(supabase);
    expect(seen.inp).toBe(input);
    expect(out).toBe(stub);
  });
});
