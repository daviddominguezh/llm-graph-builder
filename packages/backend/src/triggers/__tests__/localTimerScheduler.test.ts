import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';

import { createLocalTimerScheduler } from '../localTimerScheduler.js';
import type { TriggerTaskPayload } from '../scheduler.js';

const EPOCH = 1782637200;
const RECURRING_INTERVAL = 5;
const RECURRING_DAY_OF_MONTH = 1;
const FIRST = 0;
const ONCE = 1;
const DELAY_1S = 1000;
const DELAY_2S = 2000;
const ADVANCE_3S = 3000;
const HTTP_OK = 200;

const deps = { fireUrl: 'http://localhost:4000/internal/triggers/fire', masterKey: 'mk' };

function makePayload(overrides: Partial<TriggerTaskPayload> = {}): TriggerTaskPayload {
  return {
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
    ...overrides,
  };
}

const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: HTTP_OK }));

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockClear();
  global.fetch = fetchMock;
});

afterEach(() => {
  jest.useRealTimers();
});

it('POSTs fireUrl with the payload and x-master-key after the delay', async () => {
  const s = createLocalTimerScheduler(deps);
  await s.schedule({ runAt: new Date(Date.now() + DELAY_1S), payload: makePayload() });
  expect(fetchMock).not.toHaveBeenCalled();
  jest.advanceTimersByTime(DELAY_1S);
  expect(fetchMock).toHaveBeenCalledTimes(ONCE);
  const { mock } = fetchMock;
  const { calls } = mock;
  const [call] = calls;
  expect(call?.[FIRST]).toBe(deps.fireUrl);
  const { [ONCE]: init } = call ?? [];
  expect(new Headers(init?.headers).get('x-master-key')).toBe('mk');
  const body = typeof init?.body === 'string' ? init.body : '';
  const parsed: unknown = JSON.parse(body);
  expect(parsed).toMatchObject({ agentId: 'a1' });
});

it('cancel before the delay prevents the POST', async () => {
  const s = createLocalTimerScheduler(deps);
  await s.schedule({ runAt: new Date(Date.now() + DELAY_1S), payload: makePayload() });
  await s.cancel({ triggerId: 't1', taskEpoch: EPOCH });
  jest.advanceTimersByTime(DELAY_2S);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('re-schedule of the same name clears the prior timer (fires once)', async () => {
  const s = createLocalTimerScheduler(deps);
  await s.schedule({ runAt: new Date(Date.now() + DELAY_1S), payload: makePayload() });
  await s.schedule({ runAt: new Date(Date.now() + DELAY_2S), payload: makePayload() });
  jest.advanceTimersByTime(ADVANCE_3S);
  expect(fetchMock).toHaveBeenCalledTimes(ONCE);
});
