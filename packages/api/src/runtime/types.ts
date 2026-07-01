import type { McpServerConfig } from '@daviddh/graph-types';

import type { ExecutionEvent } from '../events/types.js';

export type DeepReadonly<T> = T extends Array<infer U>
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export type ExecutionType = 'agent' | 'workflow';

export const MAX_DISPATCH_DEPTH = 3;
export const MAX_CHILD_RUNTIME_MS = 3_600_000;

export interface ToolRef {
  providerId: string;
  toolName: string;
}

export interface RuntimeBase {
  orgId: string;
  tenantId: string;
  userId: string;
  agentId: string;
  executionType: ExecutionType;
  selectedTools: ToolRef[];
  mcpServers: McpServerConfig[];
  dispatchDepth: number;
  maxDispatchDepth: number;
  maxChildRuntimeMs: number;
}

export type RuntimeInput =
  | (RuntimeBase & { environment: 'production'; conversationId: string; executionId: string })
  | (RuntimeBase & {
      environment: 'simulation';
      simulationState: DeepReadonly<Record<string, unknown>>;
      simulationStateWritable: boolean;
    });

export interface RuntimeOutputBase {
  events: AsyncIterable<ExecutionEvent>;
  finalResult: string;
  executionType: ExecutionType;
}

export type RuntimeOutput =
  | (RuntimeOutputBase & { environment: 'production' })
  | (RuntimeOutputBase & { environment: 'simulation' });
