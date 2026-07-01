import type { ResolvedChildConfig, RuntimeCapabilities, RuntimeServices } from '../capabilities/index.js';
import type { EventEmitter } from '../events/emitter.js';
import { createEventEmitter } from '../events/emitter.js';
import type { ChildTermination } from './childDispatch.js';
import { childDispatch } from './childDispatch.js';
import type { ChildResult } from './childResult.js';
import { mapTerminationToChildResult } from './childResult.js';
import type { SimStateStore } from './simStateStore.js';
import type { StepMachine, StepReport } from './stepMachine.js';
import type { ExecutionType, RuntimeOutput } from './types.js';

/**
 * Inputs for the RU3 turn driver. `machine` is the engine adapter the caller
 * already selected for `executionType` (via `selectStepMachine`); the driver
 * only orchestrates its advance/dispatch loop and event emission.
 *
 * `emitter` is optional: the caller (T17/T18) builds the adapter with an emitter
 * and passes the SAME instance here so the adapter's per-step events and the
 * driver's terminal/child events land on one stream. When omitted (unit tests
 * with a scripted machine) the driver owns a fresh emitter.
 */
export interface ExecuteTurnArgs {
  environment: 'production' | 'simulation';
  executionType: ExecutionType;
  dispatchDepth: number;
  maxDispatchDepth: number;
  capabilities: RuntimeCapabilities;
  services: RuntimeServices;
  simStore?: SimStateStore;
  emitter?: EventEmitter;
  machine: StepMachine;
  runChildToTermination: (config: ResolvedChildConfig) => Promise<ChildTermination>;
}

type DispatchReport = Extract<StepReport, { kind: 'dispatch' }>;
type TerminalReport = Extract<StepReport, { kind: 'terminal' }>;

const ONE_LEVEL = 1;

function childIdFor(args: ExecuteTurnArgs): string {
  return `child-${String(args.dispatchDepth + ONE_LEVEL)}`;
}

async function runChild(
  args: ExecuteTurnArgs,
  config: ResolvedChildConfig
): Promise<ChildTermination> {
  return await args.runChildToTermination(config);
}

/**
 * Resolve the child config, run it engine-agnostically through `childDispatch`
 * (which enforces the depth guard via the strategy and emits child_* events),
 * then re-inject the `ChildResult` so the machine resumes with it visible.
 */
async function driveDispatch(
  args: ExecuteTurnArgs,
  emitter: EventEmitter,
  report: DispatchReport
): Promise<void> {
  const config = await args.services.resolveChildConfig({
    dispatchType: report.sentinel.type,
    params: report.sentinel.params,
    orgId: '',
  });
  const childResult = await childDispatch({
    sentinel: report.sentinel,
    dispatchDepth: args.dispatchDepth,
    maxDispatchDepth: args.maxDispatchDepth,
    environment: args.environment,
    strategy: args.capabilities.dispatch,
    emitter,
    childExecutionId: childIdFor(args),
    task: config.task,
    runChildToTermination: async (): Promise<ChildTermination> => await runChild(args, config),
  });
  args.machine.injectChildResult(childResult);
}

function textFromChildResult(result: ChildResult): string {
  if (result.status === 'finished') return result.result;
  if (result.status === 'awaiting_input') return result.partial;
  return result.message;
}

/**
 * Materialise a terminal report. Adapters can't know the environment, so they
 * return `terminal` with an optional `finishResult`; the driver derives
 * finished-vs-awaiting via the committed `mapTerminationToChildResult` (in
 * simulation a terminal with no `finishResult` is an awaiting-input partial).
 */
function finalizeTerminal(args: ExecuteTurnArgs, report: TerminalReport): string {
  const child = mapTerminationToChildResult({
    environment: args.environment,
    finishResult: report.finishResult,
    lastAssistantText: report.finalText,
  });
  return textFromChildResult(child);
}

/**
 * Advance the machine once and react. `dispatch` runs the child then recurses;
 * `terminal`/`awaiting_input` resolve the turn; `step` (per-step events already
 * emitted by the adapter) simply advances again. Recursion — not a loop — keeps
 * each `await` off the forbidden in-loop path.
 */
async function driveLoop(args: ExecuteTurnArgs, emitter: EventEmitter): Promise<string> {
  const report = await args.machine.advance();
  if (report.kind === 'dispatch') {
    await driveDispatch(args, emitter, report);
    return await driveLoop(args, emitter);
  }
  if (report.kind === 'awaiting_input') return report.partial;
  if (report.kind === 'terminal') return finalizeTerminal(args, report);
  return await driveLoop(args, emitter);
}

function emitTerminal(args: ExecuteTurnArgs, emitter: EventEmitter, finalResult: string): void {
  if (args.simStore !== undefined) {
    emitter.emit({ type: 'simulation_state_snapshot', state: args.simStore.snapshot() });
  }
  emitter.emit({ type: 'finished', result: finalResult });
}

function buildOutput(
  args: ExecuteTurnArgs,
  emitter: EventEmitter,
  finalResult: string
): RuntimeOutput {
  const base = { events: emitter.events, finalResult, executionType: args.executionType };
  if (args.environment === 'production') return { ...base, environment: 'production' };
  return { ...base, environment: 'simulation' };
}

/**
 * RU3 turn driver. Drives the selected {@link StepMachine} through its
 * advance/dispatch loop, threading `dispatchDepth`/`maxDispatchDepth` into
 * `childDispatch`, and emits `ExecutionEvent`s throughout.
 *
 * Emission ownership: the AGENT adapter owns `assistant_message` (it emits the
 * final text inside `advance`); this driver never emits `assistant_message`, only
 * the terminal `finished` (+ optional sim snapshot) and the `child_*` events
 * produced by `childDispatch`.
 */
export async function executeTurn(args: ExecuteTurnArgs): Promise<RuntimeOutput> {
  const emitter = args.emitter ?? createEventEmitter();
  const finalResult = await driveLoop(args, emitter);
  emitTerminal(args, emitter, finalResult);
  emitter.close();
  return buildOutput(args, emitter, finalResult);
}
