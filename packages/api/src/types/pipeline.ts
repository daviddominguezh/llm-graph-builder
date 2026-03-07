import type { Context } from '@src/types/tools.js';
import type { Pipeline } from '@src/utils/pipeline.js';

export const PIPELINE_EXIT_SYMBOL = Symbol('PIPELINE_EXIT');

export interface PipelineEarlyExit<T> {
  [PIPELINE_EXIT_SYMBOL]: true;
  value: T;
}

export type PipelineResult<T> = T | PipelineEarlyExit<unknown>;

export type ExtractContinueType<T> = T extends PipelineEarlyExit<unknown> ? never : T;

export type ExtractExitType<T> = T extends PipelineEarlyExit<infer U> ? U : never;

export interface PipelineStep<TInput, TOutput> {
  feature: string;
  execute: (context: Context, input: TInput) => Promise<TOutput>;
}

export interface AIPipeline<TInput = unknown, TOutput = unknown, TExitType = unknown> {
  feature: string;
  pipeline?: Pipeline<TInput, TOutput, TExitType>;
}

export function isPipelineEarlyExit(value: unknown): value is PipelineEarlyExit<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    PIPELINE_EXIT_SYMBOL in value &&
    value[PIPELINE_EXIT_SYMBOL] === true
  );
}
