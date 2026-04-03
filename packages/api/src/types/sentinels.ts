export interface DispatchSentinel {
  __sentinel: 'dispatch';
  type: 'create_agent' | 'invoke_agent' | 'invoke_workflow';
  params: Record<string, unknown>;
}

export interface FinishSentinel {
  __sentinel: 'finish';
  output: string;
  status: 'success' | 'error';
}

export type Sentinel = DispatchSentinel | FinishSentinel;

export function isDispatchSentinel(value: unknown): value is DispatchSentinel {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.__sentinel === 'dispatch';
}

export function isFinishSentinel(value: unknown): value is FinishSentinel {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.__sentinel === 'finish';
}

export function isSentinel(value: unknown): value is Sentinel {
  return isDispatchSentinel(value) || isFinishSentinel(value);
}
