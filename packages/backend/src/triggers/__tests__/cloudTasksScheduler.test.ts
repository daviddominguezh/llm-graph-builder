import { expect, it } from '@jest/globals';

import { createCloudTasksScheduler } from '../cloudTasksScheduler.js';
import type { CreateTaskRequest, DeleteTaskRequest } from '../cloudTasksScheduler.js';
import type { TriggerTaskPayload } from '../scheduler.js';

const EPOCH = 1782637200;
const EXPECTED_TASK_COUNT = 1;
const RECURRING_INTERVAL = 5;
const RECURRING_DAY_OF_MONTH = 1;
const GRPC_NOT_FOUND = 5;
const BASE64 = 'base64';

interface FakeClient {
  created: CreateTaskRequest[];
  deleted: string[];
  queuePath: (p: string, l: string, q: string) => string;
  createTask: (req: CreateTaskRequest) => Promise<unknown[]>;
  deleteTask: (req: DeleteTaskRequest) => Promise<unknown[]>;
}

function fakeClient(): FakeClient {
  const created: CreateTaskRequest[] = [];
  const deleted: string[] = [];
  return {
    created,
    deleted,
    queuePath: (p, l, q): string => `projects/${p}/locations/${l}/queues/${q}`,
    createTask: async (req): Promise<unknown[]> => {
      await Promise.resolve();
      created.push(req);
      return [{}];
    },
    deleteTask: async (req): Promise<unknown[]> => {
      await Promise.resolve();
      deleted.push(req.name);
      return [{}];
    },
  };
}

const cfg = {
  projectId: 'p',
  location: 'l',
  queue: 'agent-triggers',
  serviceAccount: 'sa@x',
  fireUrl: 'https://api/internal/triggers/fire',
  masterKey: 'mk',
};

const payload: TriggerTaskPayload = {
  triggerId: 't1',
  targetEpoch: EPOCH,
  hopEpoch: EPOCH,
  agentId: 'a1',
  tenantId: 'te1',
  initialMessage: 'hi',
  schedule: {
    mode: 'once',
    onceDateTime: '',
    recurring: {
      unit: 'minutes',
      interval: RECURRING_INTERVAL,
      weekdays: [],
      dayOfMonth: RECURRING_DAY_OF_MONTH,
      time: '09:00',
      startAt: '',
      endAt: '',
    },
  },
};

it('names the task by hopEpoch and creates an HTTP task with scheduleTime, x-master-key, and the payload body', async () => {
  const c = fakeClient();
  const s = createCloudTasksScheduler({ client: c, config: cfg });
  await s.schedule({ runAt: new Date('2026-06-24T09:00:00Z'), payload });
  expect(c.created).toHaveLength(EXPECTED_TASK_COUNT);
  const { created } = c;
  const [req] = created;
  expect(req?.task.name.endsWith('trigger-t1-1782637200')).toBe(true); // hopEpoch
  expect(req?.task.httpRequest.url).toBe(cfg.fireUrl);
  expect(req?.task.httpRequest.headers['x-master-key']).toBe('mk');
  const decoded: unknown = JSON.parse(Buffer.from(req?.task.httpRequest.body ?? '', BASE64).toString());
  expect(decoded).toMatchObject({ agentId: 'a1' });
});

it('cancel treats NOT_FOUND as success (idempotent)', async () => {
  const c = fakeClient();
  c.deleteTask = async (): Promise<unknown[]> => {
    await Promise.resolve();
    const e: Error & { code?: number } = Object.assign(new Error('not found'), { code: GRPC_NOT_FOUND });
    throw e;
  };
  const s = createCloudTasksScheduler({ client: c, config: cfg });
  await expect(s.cancel({ triggerId: 't1', taskEpoch: EPOCH })).resolves.toBeUndefined();
});
