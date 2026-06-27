import { describe, expect, it, jest } from '@jest/globals';

import type { Member, Membership } from '../membership.js';
import { HandleLocallyError, decideRoute, forwardWithReroute, resolveMembers } from '../routing.js';

const HTTP_OK = 200;
const ONE_CALL = 1;
const TWO_CALLS = 2;

const members: Member[] = [
  { machineId: 'm1', region: 'iad' },
  { machineId: 'm2', region: 'iad' },
  { machineId: 'm3', region: 'lhr' },
];

function ownerOf(poolKey: string, list: Member[], localId: string): string {
  const decision = decideRoute({ poolKey, members: list, localId });
  if (decision.kind === 'local') throw new Error('expected a non-local owner');
  return decision.machineId;
}

describe('decideRoute', () => {
  it('returns local when this machine owns the key', () => {
    const owner = ownerOf('a::t::b', members, 'zzz');
    expect(decideRoute({ poolKey: 'a::t::b', members, localId: owner })).toEqual({ kind: 'local' });
  });

  it('returns replay to the owner when this machine is not the owner', () => {
    const probe = decideRoute({ poolKey: 'a::t::b', members, localId: 'zzz' });
    expect(probe.kind).toBe('replay');
  });
});

describe('forwardWithReroute', () => {
  it('forwards to the owner on the happy path', async () => {
    const ok = new Response('ok', { status: HTTP_OK });
    const forward = jest.fn<(m: string) => Promise<Response>>(async () => await Promise.resolve(ok));
    const res = await forwardWithReroute({ poolKey: 'a::t::b', members, localId: 'zzz', forward });
    expect(res).toBe(ok);
    expect(forward).toHaveBeenCalledTimes(ONE_CALL);
  });

  it('re-routes to the next owner when the first owner connection fails', async () => {
    const owner = ownerOf('a::t::b', members, 'zzz');
    const forward = jest.fn<(m: string) => Promise<Response>>(async (m) => {
      if (m === owner) throw new Error('ECONNREFUSED');
      return await Promise.resolve(new Response('rerouted', { status: HTTP_OK }));
    });
    const res = await forwardWithReroute({ poolKey: 'a::t::b', members, localId: 'zzz', forward });
    expect(await res.text()).toBe('rerouted');
    expect(forward).toHaveBeenCalledTimes(TWO_CALLS);
  });

  it('throws HandleLocallyError when the next owner is this machine', async () => {
    const owner = ownerOf('a::t::b', members, 'zzz');
    const reduced = members.filter((m) => m.machineId !== owner);
    const nextOwner = ownerOf('a::t::b', reduced, 'zzz');
    const forward = jest.fn<(m: string) => Promise<Response>>(async (m) => {
      if (m === owner) throw new Error('dead');
      return await Promise.resolve(new Response('x'));
    });
    await expect(
      forwardWithReroute({ poolKey: 'a::t::b', members, localId: nextOwner, forward })
    ).rejects.toBeInstanceOf(HandleLocallyError);
  });
});

describe('resolveMembers', () => {
  it('falls back to local-only membership when DNS resolution fails', async () => {
    const membership: Membership = {
      list: async () => await Promise.reject(new Error('NXDOMAIN')),
      localId: () => 'self-1',
    };
    const resolved = await resolveMembers(membership);
    expect(resolved).toEqual([{ machineId: 'self-1', region: '' }]);
    expect(decideRoute({ poolKey: 'a::t::b', members: resolved, localId: 'self-1' })).toEqual({
      kind: 'local',
    });
  });

  it('returns the live membership list on success', async () => {
    const membership: Membership = {
      list: async () => await Promise.resolve(members),
      localId: () => 'm1',
    };
    expect(await resolveMembers(membership)).toBe(members);
  });
});
