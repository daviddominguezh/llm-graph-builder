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

function hasSentinelField(value: object, expected: string): boolean {
  return '__sentinel' in value && (value as { __sentinel: unknown }).__sentinel === expected;
}

export function isDispatchSentinel(value: unknown): value is DispatchSentinel {
  if (typeof value !== 'object' || value === null) return false;
  return hasSentinelField(value, 'dispatch');
}

export function isFinishSentinel(value: unknown): value is FinishSentinel {
  if (typeof value !== 'object' || value === null) return false;
  return hasSentinelField(value, 'finish');
}

export function isSentinel(value: unknown): value is Sentinel {
  return isDispatchSentinel(value) || isFinishSentinel(value);
}
