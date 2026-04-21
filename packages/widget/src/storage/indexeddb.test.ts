import { beforeEach, describe, expect, it } from 'vitest';

import { getSession, listSessions, openSessionsDB, putSession } from './indexeddb.js';

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
      createdAt: 100,
      updatedAt: 100,
      messages: [],
    });
    await putSession({
      sessionId: 's2',
      tenant: 'acme',
      agentSlug: 'x',
      title: 'Second',
      createdAt: 200,
      updatedAt: 200,
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
      createdAt: 1,
      updatedAt: 1,
      messages: [],
    });
    expect((await getSession('sx'))?.title).toBe('T');
  });
});
