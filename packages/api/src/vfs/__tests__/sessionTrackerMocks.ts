// sessionTrackerMocks.ts — mock factories for SessionTracker tests
import { jest } from '@jest/globals';

import { SessionTracker } from '../sessionTracker.js';
import type { StorageBucketApi, StorageError, SupabaseQueryBuilder, SupabaseVFSClient } from '../types.js';

// ─── Constants ──────────────────────────────────────────────────────────────

export const SESSION_KEY = 'tenant/agent/user/session';
export const TENANT_SLUG = 'acme';
export const AGENT_SLUG = 'bot';
export const USER_ID = 'user-1';
export const SESSION_ID = 'sess-1';
export const COMMIT_SHA = 'abc123';
export const THROTTLE_MS = 60_000;
export const JUST_BEFORE_THROTTLE = 59_999;
export const INIT_ERR_MSG = 'upsert failed';
export const EXPECTED_ONE_CALL = 1;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MockQueryBuilder extends SupabaseQueryBuilder {
  upsert: jest.Mock<SupabaseQueryBuilder['upsert']>;
  update: jest.Mock<SupabaseQueryBuilder['update']>;
  eq: jest.Mock<SupabaseQueryBuilder['eq']>;
  select: jest.Mock<SupabaseQueryBuilder['select']>;
  single: jest.Mock<SupabaseQueryBuilder['single']>;
}

export interface TrackerTestContext {
  qb: MockQueryBuilder;
  tracker: SessionTracker;
}

// ─── Builder ────────────────────────────────────────────────────────────────

function buildThenFn(error: StorageError | null): SupabaseQueryBuilder['then'] {
  const data = error === null ? {} : null;
  return async (onfulfilled) => await Promise.resolve(onfulfilled({ data, error }));
}

function wireChaining(qb: MockQueryBuilder): void {
  qb.upsert.mockReturnValue(qb);
  qb.update.mockReturnValue(qb);
  qb.eq.mockReturnValue(qb);
  qb.select.mockReturnValue(qb);
  qb.single.mockReturnValue(qb);
}

function createQb(error: StorageError | null): MockQueryBuilder {
  const qb: MockQueryBuilder = {
    upsert: jest.fn<SupabaseQueryBuilder['upsert']>(),
    update: jest.fn<SupabaseQueryBuilder['update']>(),
    delete: jest.fn<SupabaseQueryBuilder['delete']>(),
    eq: jest.fn<SupabaseQueryBuilder['eq']>(),
    select: jest.fn<SupabaseQueryBuilder['select']>(),
    lt: jest.fn<SupabaseQueryBuilder['lt']>(),
    single: jest.fn<SupabaseQueryBuilder['single']>(),
    then: buildThenFn(error),
  };
  wireChaining(qb);
  return qb;
}

export function createSuccessQb(): MockQueryBuilder {
  return createQb(null);
}

export function createErrorQb(): MockQueryBuilder {
  return createQb({ message: INIT_ERR_MSG });
}

// ─── Supabase Client ────────────────────────────────────────────────────────

function createMockBucket(): StorageBucketApi {
  return {
    upload: jest.fn<StorageBucketApi['upload']>().mockResolvedValue({ data: null, error: null }),
    download: jest.fn<StorageBucketApi['download']>().mockResolvedValue({ data: null, error: null }),
    remove: jest.fn<StorageBucketApi['remove']>().mockResolvedValue({ data: null, error: null }),
    copy: jest.fn<StorageBucketApi['copy']>().mockResolvedValue({ data: null, error: null }),
    list: jest.fn<StorageBucketApi['list']>().mockResolvedValue({ data: null, error: null }),
  };
}

export function createMockSupabase(qb: MockQueryBuilder): SupabaseVFSClient {
  const bucket = createMockBucket();
  const storageFrom = jest.fn<(b: string) => StorageBucketApi>().mockReturnValue(bucket);
  const tableFrom = jest.fn<(t: string) => SupabaseQueryBuilder>().mockReturnValue(qb);
  return { storage: { from: storageFrom }, from: tableFrom };
}

// ─── Context Factory ────────────────────────────────────────────────────────

export function createTrackerContext(qb: MockQueryBuilder): TrackerTestContext {
  const supabase = createMockSupabase(qb);
  const tracker = new SessionTracker(supabase, SESSION_KEY);
  return { qb, tracker };
}

export function defaultParams(): {
  tenantSlug: string;
  agentSlug: string;
  userID: string;
  sessionId: string;
  commitSha: string;
} {
  return {
    tenantSlug: TENANT_SLUG,
    agentSlug: AGENT_SLUG,
    userID: USER_ID,
    sessionId: SESSION_ID,
    commitSha: COMMIT_SHA,
  };
}
