import { beforeEach, describe, expect, it } from 'vitest';

import { getSession, listSessions, openSessionsDB, putSession } from './indexeddb.js';

const TIMESTAMP_FIRST = 100;
const TIMESTAMP_SECOND = 200;
const TIMESTAMP_UNIT = 1;

async function clearSessions(): Promise<void> {
  const db = await openSessionsDB();
  await db.clear('sessions');
}

async function seedMixedSessions(): Promise<void> {
  await putSession({
    sessionId: 's1',
    tenant: 'acme',
    agentSlug: 'x',
    title: 'First',
    createdAt: TIMESTAMP_FIRST,
    updatedAt: TIMESTAMP_FIRST,
    messages: [],
  });
  await putSession({
    sessionId: 's2',
    tenant: 'acme',
    agentSlug: 'x',
    title: 'Second',
    createdAt: TIMESTAMP_SECOND,
    updatedAt: TIMESTAMP_SECOND,
    messages: [],
  });
  await putSession({
    sessionId: 's3',
    tenant: 'other',
    agentSlug: 'x',
    title: 'OtherTenant',
    createdAt: TIMESTAMP_SECOND,
    updatedAt: TIMESTAMP_SECOND,
    messages: [],
  });
  await putSession({
    sessionId: 's4',
    tenant: 'acme',
    agentSlug: 'y',
    title: 'OtherAgent',
    createdAt: TIMESTAMP_SECOND,
    updatedAt: TIMESTAMP_SECOND,
    messages: [],
  });
}

async function seedSingleSession(): Promise<void> {
  await putSession({
    sessionId: 'sx',
    tenant: 'acme',
    agentSlug: 'x',
    title: 'T',
    createdAt: TIMESTAMP_UNIT,
    updatedAt: TIMESTAMP_UNIT,
    messages: [],
  });
}

describe('listSessions scoping', () => {
  beforeEach(clearSessions);

  it('returns only sessions matching the given tenant and agent', async () => {
    await seedMixedSessions();
    const list = await listSessions('acme', 'x');
    expect(list.map((s) => s.sessionId)).toEqual(['s2', 's1']);
  });
});

describe('getSession scoping', () => {
  beforeEach(clearSessions);

  it('returns the stored entry when tenant and agent match', async () => {
    await seedSingleSession();
    expect((await getSession('acme', 'x', 'sx'))?.title).toBe('T');
  });

  it('returns undefined when tenant or agent differs', async () => {
    await seedSingleSession();
    expect(await getSession('other', 'x', 'sx')).toBeUndefined();
    expect(await getSession('acme', 'y', 'sx')).toBeUndefined();
  });
});
