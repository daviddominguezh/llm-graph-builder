import { beforeEach, describe, expect, it } from 'vitest';

import { getSession, listSessions, openSessionsDB, putSession } from './indexeddb.js';

const TIMESTAMP_FIRST = 100;
const TIMESTAMP_SECOND = 200;
const TIMESTAMP_UNIT = 1;

describe('indexeddb', () => {
  beforeEach(async () => {
    const db = await openSessionsDB();
    await db.clear('sessions');
  });

  it('puts and lists sessions ordered by updatedAt desc', async () => {
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
    const list = await listSessions();
    expect(list.map((s) => s.sessionId)).toEqual(['s2', 's1']);
  });

  it('getSession returns stored entry', async () => {
    await putSession({
      sessionId: 'sx',
      tenant: 'acme',
      agentSlug: 'x',
      title: 'T',
      createdAt: TIMESTAMP_UNIT,
      updatedAt: TIMESTAMP_UNIT,
      messages: [],
    });
    expect((await getSession('sx'))?.title).toBe('T');
  });
});
