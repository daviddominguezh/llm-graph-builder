import { describe, expect, it, jest } from '@jest/globals';

import { type MembershipDeps, createMembership, parseTxtRecords } from '../membership.js';

const ZERO = 0;
const ONE_SECOND = 1_000;
const FIVE_SECONDS = 5_000;
const THREE_SECONDS = 3_000;
const ONE_CALL = 1;
const TWO_CALLS = 2;

function txtMock(): jest.Mock<MembershipDeps['resolveTxt']> {
  return jest.fn<MembershipDeps['resolveTxt']>(async () => await Promise.resolve([['148ed123 iad']]));
}

function deps(resolveTxt: MembershipDeps['resolveTxt'], now: () => number): MembershipDeps {
  return { resolveTxt, now, appName: 'openflow-backend', localMachineId: '148ed123' };
}

describe('parseTxtRecords', () => {
  it('parses "<machineId> <region>" TXT chunks', () => {
    expect(parseTxtRecords([['148ed123 iad'], ['9080ee45 lhr']])).toEqual([
      { machineId: '148ed123', region: 'iad' },
      { machineId: '9080ee45', region: 'lhr' },
    ]);
  });

  it('joins multi-chunk TXT records before parsing', () => {
    expect(parseTxtRecords([['148ed', '123 iad']])).toEqual([{ machineId: '148ed123', region: 'iad' }]);
  });

  it('skips empty/malformed chunks', () => {
    expect(parseTxtRecords([[''], ['148ed123 iad']])).toEqual([{ machineId: '148ed123', region: 'iad' }]);
  });

  it('defaults region to empty string when absent', () => {
    expect(parseTxtRecords([['148ed123']])).toEqual([{ machineId: '148ed123', region: '' }]);
  });
});

describe('createMembership cache', () => {
  it('caches the resolved list within cacheMs (one DNS call)', async () => {
    let clock = ZERO;
    const resolveTxt = txtMock();
    const m = createMembership(deps(resolveTxt, () => clock), THREE_SECONDS);
    await m.list();
    clock = ONE_SECOND;
    await m.list();
    expect(resolveTxt).toHaveBeenCalledTimes(ONE_CALL);
    clock = FIVE_SECONDS;
    await m.list();
    expect(resolveTxt).toHaveBeenCalledTimes(TWO_CALLS);
  });

  it('resolves vms.<app>.internal', async () => {
    const resolveTxt = txtMock();
    await createMembership(deps(resolveTxt, () => ZERO)).list();
    expect(resolveTxt).toHaveBeenCalledWith('vms.openflow-backend.internal');
  });

  it('exposes the local machine id via localId()', () => {
    expect(createMembership(deps(txtMock(), () => ZERO)).localId()).toBe('148ed123');
  });
});
