import type { Operation } from '@daviddh/graph-types';
import { describe, expect, it, jest } from '@jest/globals';

import { OperationQueueCore } from '../operationQueueCore';

function op(nodeId: string): Operation {
  return { type: 'deleteNode', nodeId };
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: Error) => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  let reject: (err: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('OperationQueueCore flush serialization', () => {
  it('never runs two sends concurrently: second flush waits for the first', async () => {
    const gates: Deferred[] = [];
    const sent: Operation[][] = [];
    const send = jest.fn((ops: Operation[]) => {
      sent.push(ops);
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    });
    const core = new OperationQueueCore(send, () => undefined);

    core.push(op('a'));
    const first = core.flush();
    await flushMicrotasks();

    core.push(op('b'));
    const second = core.flush();
    await flushMicrotasks();

    expect(send).toHaveBeenCalledTimes(1);

    gates[0]?.resolve();
    await first;
    await flushMicrotasks();

    expect(send).toHaveBeenCalledTimes(2);
    expect(sent[0]).toEqual([op('a')]);
    expect(sent[1]).toEqual([op('b')]);

    gates[1]?.resolve();
    await second;
  });

  it('requeues failed ops ahead of newer ops so nothing is lost or reordered', async () => {
    const gates: Deferred[] = [];
    const sent: Operation[][] = [];
    const send = jest.fn((ops: Operation[]) => {
      sent.push(ops);
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    });
    const core = new OperationQueueCore(send, () => undefined);

    core.push(op('a'));
    const first = core.flush();
    await flushMicrotasks();

    core.push(op('b'));
    const second = core.flush();

    gates[0]?.reject(new Error('network down'));
    await expect(first).rejects.toThrow('network down');
    await flushMicrotasks();

    gates[1]?.resolve();
    await second;

    expect(sent[1]).toEqual([op('a'), op('b')]);
    expect(core.getPendingCount()).toBe(0);
  });

  it('keeps in-flight ops counted as pending until the server confirms', async () => {
    const gate = deferred();
    const send = jest.fn(() => gate.promise);
    const counts: number[] = [];
    const core = new OperationQueueCore(send, (count) => {
      counts.push(count);
    });

    core.push(op('a'));
    expect(core.getPendingCount()).toBe(1);

    const flushed = core.flush();
    await flushMicrotasks();
    expect(core.getPendingCount()).toBe(1);

    gate.resolve();
    await flushed;
    expect(core.getPendingCount()).toBe(0);
    expect(counts.at(-1)).toBe(0);
  });

  it('retains failed ops as pending after a failed flush', async () => {
    const send = jest.fn(() => Promise.reject(new Error('boom')));
    const core = new OperationQueueCore(send, () => undefined);

    core.push(op('a'));
    await expect(core.flush()).rejects.toThrow('boom');

    expect(core.getPendingCount()).toBe(1);

    const okSend = jest.fn(() => Promise.resolve());
    const core2 = new OperationQueueCore(okSend, () => undefined);
    core2.push(op('x'));
    await core2.flush();
    expect(core2.getPendingCount()).toBe(0);
  });

  it('does not resurrect ops after clear(), even if an in-flight send fails later', async () => {
    const gate = deferred();
    const send = jest.fn(() => gate.promise);
    const core = new OperationQueueCore(send, () => undefined);

    core.push(op('a'));
    const flushed = core.flush();
    await flushMicrotasks();

    core.clear();
    gate.reject(new Error('late failure'));
    await expect(flushed).rejects.toThrow('late failure');

    expect(core.getPendingCount()).toBe(0);
  });

  it('flush with an empty queue resolves without sending', async () => {
    const send = jest.fn(() => Promise.resolve());
    const core = new OperationQueueCore(send, () => undefined);
    await core.flush();
    expect(send).not.toHaveBeenCalled();
  });

  it('passes the configured context and a live pending counter to send', async () => {
    const seen: { agentId: string | undefined; midFlightCount: number }[] = [];
    const send = jest.fn(
      (ops: Operation[], ctx: { agentId: string | undefined }, getPendingCount: () => number) => {
        seen.push({ agentId: ctx.agentId, midFlightCount: getPendingCount() });
        return Promise.resolve();
      }
    );
    const core = new OperationQueueCore(send, () => undefined);
    core.setContext({ agentId: 'agent-42', getLocalGraph: () => null });

    core.push(op('a'));
    await core.flush();

    expect(seen).toEqual([{ agentId: 'agent-42', midFlightCount: 1 }]);
  });

  it('notifies pending counts on push, clear, and settle', async () => {
    const counts: number[] = [];
    const send = jest.fn(() => Promise.resolve());
    const core = new OperationQueueCore(send, (count) => {
      counts.push(count);
    });

    core.push(op('a'));
    core.push(op('b'));
    await core.flush();
    core.push(op('c'));
    core.clear();

    expect(counts).toEqual([1, 2, 0, 1, 0]);
  });

  it('keeps serving flushes after a failure (chain is not poisoned)', async () => {
    const send = jest
      .fn<(ops: Operation[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error('first fails'))
      .mockResolvedValue(undefined);
    const core = new OperationQueueCore(send, () => undefined);

    core.push(op('a'));
    await expect(core.flush()).rejects.toThrow('first fails');
    await core.flush();

    expect(send).toHaveBeenCalledTimes(2);
    expect(core.getPendingCount()).toBe(0);
  });
});
