import type { Operation } from '@daviddh/graph-types';

import type { DebugGraphState } from '../utils/graphSaveDebug';

export interface SendContext {
  agentId: string | undefined;
  getLocalGraph: () => DebugGraphState | null;
}

type SendFn = (ops: Operation[], ctx: SendContext, getPendingCount: () => number) => Promise<void>;
type NotifyFn = (pendingCount: number) => void;

const EMPTY = 0;

/**
 * Framework-free core of the graph save queue.
 *
 * Guarantees that motivated this class (see the editor data-loss incident):
 * - Flushes are strictly serialized: a flush never starts while another send
 *   is in flight, so operation batches cannot reach the backend out of order.
 * - Failed batches are requeued AT THE FRONT of the queue (preserving op
 *   order) instead of being dropped. The only way ops are discarded is an
 *   explicit clear().
 * - In-flight ops still count as pending, so the UI cannot report "saved"
 *   before the server has acknowledged the batch.
 */
export class OperationQueueCore {
  private queue: Operation[] = [];
  private inFlight: Operation[] = [];
  private clearGen = EMPTY;
  private chain: Promise<void> = Promise.resolve();
  private ctx: SendContext = { agentId: undefined, getLocalGraph: () => null };

  constructor(
    private readonly send: SendFn,
    private readonly notify: NotifyFn
  ) {}

  /** Updates the context (agent id, debug state provider) used by sends. */
  setContext(ctx: SendContext): void {
    this.ctx = ctx;
  }

  push(operation: Operation): void {
    this.queue = [...this.queue, operation];
    this.notify(this.getPendingCount());
  }

  getPendingCount(): number {
    return this.queue.length + this.inFlight.length;
  }

  /**
   * Flushes the queue. If a send is already in flight, this flush waits for
   * it to settle before sending, so batches are applied strictly in order.
   */
  flush(): Promise<void> {
    const run = this.chain.then(() => this.flushNow());
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** Discards all pending ops. In-flight ops that later fail stay discarded. */
  clear(): void {
    this.clearGen++;
    this.queue = [];
    this.notify(this.getPendingCount());
  }

  private async flushNow(): Promise<void> {
    if (this.queue.length === EMPTY) return;

    const gen = this.clearGen;
    const ops = this.queue;
    this.queue = [];
    this.inFlight = ops;

    try {
      await this.send(ops, this.ctx, () => this.getPendingCount());
      this.inFlight = [];
      this.notify(this.getPendingCount());
    } catch (error: unknown) {
      this.inFlight = [];
      if (gen === this.clearGen) {
        this.queue = [...ops, ...this.queue];
      }
      this.notify(this.getPendingCount());
      throw error;
    }
  }
}
