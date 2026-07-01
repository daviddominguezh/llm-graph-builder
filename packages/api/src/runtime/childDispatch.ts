import type { DispatchStrategy } from '../capabilities/dispatchStrategy.js';
import type { EventEmitter } from '../events/emitter.js';
import type { DispatchSentinel, FinishSentinel } from '../types/sentinels.js';
import type { ChildResult } from './childResult.js';
import { mapTerminationToChildResult } from './childResult.js';

export interface ChildTermination {
  finishResult?: FinishSentinel;
  lastAssistantText: string;
}

export interface ChildDispatchArgs {
  sentinel: DispatchSentinel;
  dispatchDepth: number;
  maxDispatchDepth: number;
  environment: 'production' | 'simulation';
  strategy: DispatchStrategy;
  emitter: EventEmitter;
  childExecutionId: string;
  task: string;
  runChildToTermination: () => Promise<ChildTermination>;
}

const SUSPEND_NOT_RUN_MESSAGE = 'Durable suspend not run in simulation.';
const ONE_LEVEL = 1;

function childDepth(args: ChildDispatchArgs): number {
  return args.dispatchDepth + ONE_LEVEL;
}

function emitDispatched(args: ChildDispatchArgs): void {
  args.emitter.emit({
    type: 'child_dispatched',
    childExecutionId: args.childExecutionId,
    dispatchType: args.sentinel.type,
    task: args.task,
    depth: childDepth(args),
  });
}

function emitCompleted(args: ChildDispatchArgs, result: ChildResult): void {
  const depth = childDepth(args);
  if (result.status === 'awaiting_input') {
    args.emitter.emit({
      type: 'child_awaiting_input',
      childExecutionId: args.childExecutionId,
      partial: result.partial,
      depth,
    });
    return;
  }
  args.emitter.emit({ type: 'child_finished', childExecutionId: args.childExecutionId, result, depth });
}

function emitSuspended(args: ChildDispatchArgs): void {
  args.emitter.emit({
    type: 'child_suspended',
    childExecutionId: args.childExecutionId,
    depth: childDepth(args),
  });
}

function makeRunChild(args: ChildDispatchArgs): () => Promise<ChildResult> {
  return async (): Promise<ChildResult> => {
    const term = await args.runChildToTermination();
    return mapTerminationToChildResult({
      environment: args.environment,
      finishResult: term.finishResult,
      lastAssistantText: term.lastAssistantText,
    });
  };
}

export async function childDispatch(args: ChildDispatchArgs): Promise<ChildResult> {
  emitDispatched(args);
  const outcome = await args.strategy.dispatch({
    dispatchDepth: args.dispatchDepth,
    maxDispatchDepth: args.maxDispatchDepth,
    runChild: makeRunChild(args),
  });
  if (outcome.kind === 'completed') {
    emitCompleted(args, outcome.childResult);
    return outcome.childResult;
  }
  emitSuspended(args);
  return { status: 'error', code: 'child_failed', message: SUSPEND_NOT_RUN_MESSAGE };
}
