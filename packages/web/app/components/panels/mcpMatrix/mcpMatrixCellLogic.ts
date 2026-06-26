import type { VariableValue } from '../VariableValuesEditor';

export function isEnvRef(value: VariableValue): boolean {
  return value.type === 'env_ref';
}

// Pure toggle: direct <-> env_ref, always resetting the new mode's payload.
export function toggleCellMode(value: VariableValue, useEnvRef: boolean): VariableValue {
  if (useEnvRef) return { type: 'env_ref', envVariableId: '' };
  return { type: 'direct', value: '' };
}
