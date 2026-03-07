import {
  type ExtractContinueType,
  type ExtractExitType,
  PIPELINE_EXIT_SYMBOL,
  type PipelineEarlyExit,
  type PipelineResult,
  type PipelineStep,
  isPipelineEarlyExit,
} from '@src/types/pipeline.js';
import type { Context } from '@src/types/tools.js';
import { logger } from '@src/utils/logger.js';

const EMPTY_COUNT = 0;
const STEP_NUMBER_OFFSET = 1;

interface StepEntry {
  feature: string;
  execute: (context: Context, input: unknown) => Promise<unknown>;
}

interface FinishCallbackEntry {
  task: string;
  triggerKey: string;
  callback: (task: string, data: unknown, context: Context) => Promise<void>;
}

type StepOutcome =
  | { earlyExit: false; value: unknown }
  | { earlyExit: true; value: unknown }
  | null;

interface StepLogInfo {
  stepNum: number;
  total: number;
  logKey: string;
}

function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorInfo(error: unknown): { message: string; stack: string | undefined } {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return { message, stack };
}

async function executeSinglePipelineStep(
  context: Context,
  step: StepEntry,
  input: unknown,
  logInfo: StepLogInfo
): Promise<StepOutcome> {
  const { feature, execute } = step;
  const { stepNum, total, logKey } = logInfo;
  logger.info(`${logKey}Executing step ${stepNum}/${total}: ${feature}`);
  const result = await execute(context, input);
  if (result === null || result === undefined) {
    logger.error(`${logKey}Step ${stepNum} (${feature}) returned null/undefined, stopping pipeline`);
    return null;
  }
  if (isPipelineEarlyExit(result)) {
    logger.info(`${logKey}Step ${stepNum} (${feature}) triggered early exit, stopping pipeline`);
    return { earlyExit: true, value: result.value };
  }
  logger.info(`${logKey}Completed step ${stepNum}/${total}: ${feature}`);
  return { earlyExit: false, value: result };
}

function handleStepError(logInfo: StepLogInfo, feature: string, stepError: unknown): never {
  const { stepNum, logKey } = logInfo;
  const { message, stack } = getErrorInfo(stepError);
  logger.error(`${logKey}Step ${stepNum} (${feature}) failed:`, { error: message, stack });
  throw new Error(`Pipeline step '${feature}' failed: ${message}`, { cause: stepError });
}

async function processAllSteps(
  context: Context,
  steps: readonly StepEntry[],
  initialInput: unknown,
  logKey: string
): Promise<StepOutcome> {
  const seed: StepOutcome = { earlyExit: false, value: initialInput };
  return await steps.reduce<Promise<StepOutcome>>(
    async (accPromise, step, index) => {
      const acc = await accPromise;
      if (acc === null || acc.earlyExit) return acc;
      const stepNum = index + STEP_NUMBER_OFFSET;
      const logInfo: StepLogInfo = { stepNum, total: steps.length, logKey };
      try {
        return await executeSinglePipelineStep(context, step, acc.value, logInfo);
      } catch (stepError: unknown) {
        return handleStepError(logInfo, step.feature, stepError);
      }
    },
    Promise.resolve(seed)
  );
}

async function executeSingleCallback(
  entry: FinishCallbackEntry,
  resultObj: Record<string, unknown>,
  context: Context,
  logKey: string
): Promise<void> {
  const { triggerKey, callback, task } = entry;
  if (!(triggerKey in resultObj)) return;
  try {
    logger.info(`${logKey}Triggering finish callback for key: ${triggerKey}`);
    await callback(task, resultObj[triggerKey], context);
    logger.info(`${logKey}Finish callback for key ${triggerKey} completed`);
  } catch (callbackError: unknown) {
    const { message, stack } = getErrorInfo(callbackError);
    logger.error(`${logKey}Finish callback for key ${triggerKey} failed:`, { error: message, stack });
  }
}

async function runFinishCallbacks(
  result: unknown,
  callbacks: readonly FinishCallbackEntry[],
  context: Context,
  logKey: string
): Promise<void> {
  if (!isNonNullObject(result)) return;
  await Promise.all(
    callbacks.map(async (cb) => {
      await executeSingleCallback(cb, result, context, logKey);
    })
  );
}

export class Pipeline<TInitialInput, TCurrentOutput, TExitType = never> {
  private constructor(
    private readonly steps: StepEntry[],
    private readonly finishCallbacks: FinishCallbackEntry[]
  ) {}

  static create<TInput>(): Pipeline<TInput, TInput> {
    return new Pipeline<TInput, TInput>([], []);
  }

  static createEarlyExit<T>(value: T): PipelineEarlyExit<T> {
    return { [PIPELINE_EXIT_SYMBOL]: true, value };
  }

  static async executeSingleStep<TInput, TOutput>(
    context: Context,
    step: PipelineStep<TInput, TOutput>,
    input: TInput
  ): Promise<TOutput | null> {
    const logKey = `executingSingleStep/${context.tenantID}| `;
    try {
      logger.info(`${logKey}Executing single step: ${step.feature}`);
      const result = await step.execute(context, input);
      logger.info(`${logKey}Step ${step.feature} completed successfully`);
      return result;
    } catch (error: unknown) {
      const { message, stack } = getErrorInfo(error);
      logger.error(`${logKey}Step ${step.feature} failed:`, { error: message, stack });
      return null;
    }
  }

  addStep<TNextOutput extends PipelineResult<unknown>>(
    step: PipelineStep<ExtractContinueType<TCurrentOutput>, TNextOutput>
  ): Pipeline<
    TInitialInput,
    ExtractContinueType<TNextOutput>,
    TExitType | ExtractExitType<TCurrentOutput> | ExtractExitType<TNextOutput>
  > {
    type StepInput = ExtractContinueType<TCurrentOutput>;
    function isStepInput(value: unknown): value is StepInput {
      return true;
    }
    const wrappedExecute = async (ctx: Context, input: unknown): Promise<unknown> => {
      if (isStepInput(input)) return await step.execute(ctx, input);
      return undefined;
    };
    this.steps.push({ feature: step.feature, execute: wrappedExecute });
    type NewExit = TExitType | ExtractExitType<TCurrentOutput> | ExtractExitType<TNextOutput>;
    return new Pipeline<TInitialInput, ExtractContinueType<TNextOutput>, NewExit>(
      this.steps,
      this.finishCallbacks
    );
  }

  addOnFinishCallbackTrigger(
    task: string,
    triggerKey: string,
    callback: (task: string, data: unknown, context: Context) => Promise<void>
  ): this {
    this.finishCallbacks.push({ task, triggerKey, callback });
    return this;
  }

  async execute(
    context: Context,
    initialInput: TInitialInput
  ): Promise<TCurrentOutput | TExitType | null> {
    const logKey = `executingPipeline/${context.namespace}| `;
    logger.info(`${logKey}Starting pipeline with ${this.steps.length} steps...`);
    if (this.steps.length === EMPTY_COUNT) {
      logger.warn(`${logKey}Pipeline has no steps, returning null`);
      return null;
    }
    try {
      const outcome = await processAllSteps(context, this.steps, initialInput, logKey);
      return await this.resolveOutcome(outcome, context, logKey);
    } catch (error: unknown) {
      const { message, stack } = getErrorInfo(error);
      logger.error(`${logKey}Pipeline execution failed:`, { error: message, stack });
      return null;
    }
  }

  private async resolveOutcome(
    outcome: StepOutcome,
    context: Context,
    logKey: string
  ): Promise<TCurrentOutput | TExitType | null> {
    function isExitType(value: unknown): value is TExitType {
      return true;
    }
    function isOutputType(value: unknown): value is TCurrentOutput {
      return true;
    }
    if (outcome === null) return null;
    if (outcome.earlyExit && isExitType(outcome.value)) return outcome.value;
    logger.info(`${logKey}Pipeline execution completed successfully`);
    logger.debug(`${logKey}Final result:`, JSON.stringify(outcome.value));
    await runFinishCallbacks(outcome.value, this.finishCallbacks, context, logKey);
    if (isOutputType(outcome.value)) return outcome.value;
    return null;
  }

  getSteps(): readonly StepEntry[] {
    return [...this.steps];
  }
}
