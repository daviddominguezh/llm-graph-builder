import type { SupabaseClient } from '@supabase/supabase-js';

import { makeLeadScoringDbService } from '../leadScoring/leadScoringService.js';

// The factory only ever touches a narrow slice of the client (from→select→eq→
// single and from→update→eq), so we build a minimal stub and narrow it through a
// type guard rather than an `as` assertion (the lint-clean idiom in this suite).
function isSupabaseClient(value: unknown): value is SupabaseClient {
  return typeof value === 'object' && value !== null && 'from' in value;
}

function narrow(stub: object): SupabaseClient {
  if (!isSupabaseClient(stub)) throw new Error('stub is not a supabase client');
  return stub;
}

// Leaf stubs must be `async` (promise-function-async) yet contain an `await`
// (require-await); this helper satisfies both while keeping the stubs terse.
async function resolved<T>(value: T): Promise<T> {
  await Promise.resolve();
  return value;
}

function readStub(metadata: unknown): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => await resolved({ data: { metadata }, error: null }),
  };
  return narrow({ from: () => builder });
}

const READ_SCORE = 73;
const WRITE_SCORE = 88;
const SIBLING_VALUE = 1;

function writeStub(onWrite: (patch: unknown) => void): SupabaseClient {
  const sibling = { forms: { a: SIBLING_VALUE } };
  return narrow({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => await resolved({ data: { metadata: sibling }, error: null }),
        }),
      }),
      update: (patch: unknown) => ({
        eq: async () => {
          onWrite(patch);
          return await resolved({ error: null });
        },
      }),
    }),
  });
}

describe('makeLeadScoringDbService', () => {
  it('reads lead_score from conversation metadata', async () => {
    const svc = makeLeadScoringDbService(readStub({ lead_score: READ_SCORE }), 'conv1');
    expect(await svc.getLeadScore()).toBe(READ_SCORE);
  });

  it('returns null when no lead_score is present', async () => {
    const svc = makeLeadScoringDbService(readStub({}), 'conv1');
    expect(await svc.getLeadScore()).toBeNull();
  });

  it('returns null when metadata itself is null', async () => {
    const svc = makeLeadScoringDbService(readStub(null), 'conv1');
    expect(await svc.getLeadScore()).toBeNull();
  });

  it('setLeadScore read-merge-writes metadata, preserving other keys', async () => {
    let written: unknown = null;
    const svc = makeLeadScoringDbService(
      writeStub((patch) => {
        written = patch;
      }),
      'conv1'
    );
    await svc.setLeadScore(WRITE_SCORE);
    expect(written).toEqual({ metadata: { forms: { a: SIBLING_VALUE }, lead_score: WRITE_SCORE } });
  });
});
