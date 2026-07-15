import { describe, expect, it } from '@jest/globals';

const { withAgentLock } = await import('../agentBatchLock.js');

const RETURN_VALUE = 42;

interface Signal {
  promise: Promise<void>;
  fire: () => void;
}

function signal(): Signal {
  const { promise, resolve } = Promise.withResolvers<undefined>();
  return {
    promise,
    fire: (): void => {
      resolve(undefined);
    },
  };
}

describe('withAgentLock serialization', () => {
  it('serializes two calls for the same agent (second waits for the first)', async () => {
    const order: string[] = [];
    const started1 = signal();
    const release1 = signal();

    const p1 = withAgentLock('same', async () => {
      order.push('fn1-start');
      started1.fire();
      await release1.promise;
      order.push('fn1-end');
    });
    const p2 = withAgentLock('same', async () => {
      await Promise.resolve(undefined);
      order.push('fn2-start');
    });

    await started1.promise;
    expect(order).toEqual(['fn1-start']);

    release1.fire();
    await Promise.all([p1, p2]);
    expect(order).toEqual(['fn1-start', 'fn1-end', 'fn2-start']);
  });

});

describe('withAgentLock concurrency', () => {
  it('runs calls for different agents concurrently', async () => {
    const startedA = signal();
    const startedB = signal();
    const release = signal();

    const pa = withAgentLock('agent-a', async () => {
      startedA.fire();
      await release.promise;
    });
    const pb = withAgentLock('agent-b', async () => {
      startedB.fire();
      await release.promise;
    });

    await Promise.all([startedA.promise, startedB.promise]);
    release.fire();
    await Promise.all([pa, pb]);
  });

});

describe('withAgentLock error handling', () => {
  it('does not break the chain when a queued fn rejects (next still runs)', async () => {
    const release1 = signal();
    const p1 = withAgentLock('chain', async () => {
      await release1.promise;
      throw new Error('boom');
    });
    const p2 = withAgentLock('chain', async () => {
      await Promise.resolve(undefined);
      return 'after-reject';
    });

    release1.fire();
    await expect(p1).rejects.toThrow('boom');
    await expect(p2).resolves.toBe('after-reject');
  });

  it('propagates a rejection to the caller of withAgentLock', async () => {
    await expect(
      withAgentLock('reject', async () => {
        await Promise.resolve(undefined);
        throw new Error('kaboom');
      })
    ).rejects.toThrow('kaboom');
  });

  it('passes the fn return value through', async () => {
    await expect(
      withAgentLock('value', async () => {
        await Promise.resolve(undefined);
        return RETURN_VALUE;
      })
    ).resolves.toBe(RETURN_VALUE);
  });
});
