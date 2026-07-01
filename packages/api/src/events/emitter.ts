import type { ExecutionEvent } from './types.js';

export interface EventEmitter {
  emit: (ev: ExecutionEvent) => void;
  close: () => void;
  events: AsyncIterable<ExecutionEvent>;
}

type Resolver = (r: IteratorResult<ExecutionEvent>) => void;

const DONE: IteratorResult<ExecutionEvent> = { value: undefined, done: true };

export function createEventEmitter(): EventEmitter {
  const queue: ExecutionEvent[] = [];
  const waiters: Resolver[] = [];
  let closed = false;

  function emit(ev: ExecutionEvent): void {
    if (closed) return;
    const waiter = waiters.shift();
    if (waiter !== undefined) {
      waiter({ value: ev, done: false });
      return;
    }
    queue.push(ev);
  }

  function close(): void {
    closed = true;
    let waiter = waiters.shift();
    while (waiter !== undefined) {
      waiter(DONE);
      waiter = waiters.shift();
    }
  }

  async function next(): Promise<IteratorResult<ExecutionEvent>> {
    const queued = queue.shift();
    if (queued !== undefined) return { value: queued, done: false };
    if (closed) return DONE;
    const { promise, resolve } = Promise.withResolvers<IteratorResult<ExecutionEvent>>();
    waiters.push(resolve);
    return await promise;
  }

  const events: AsyncIterable<ExecutionEvent> = {
    [Symbol.asyncIterator]: () => ({ next }),
  };

  return { emit, close, events };
}
