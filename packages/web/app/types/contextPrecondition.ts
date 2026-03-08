export type ComparisonOperator = 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';

export type LogicalOperator = 'and' | 'or';

export type OperandType = 'key' | 'literal' | 'null';

export interface Operand {
  type: OperandType;
  value: string;
}

export interface Comparison {
  type: 'comparison';
  left: Operand;
  operator: ComparisonOperator;
  right: Operand;
}

export interface ConditionGroup {
  type: 'group';
  operator: LogicalOperator;
  conditions: ConditionNode[];
}

export type ConditionNode = Comparison | ConditionGroup;

export interface ContextPrecondition {
  id: string;
  name: string;
  root: ConditionGroup;
}

export function createEmptyGroup(): ConditionGroup {
  return { type: 'group', operator: 'and', conditions: [] };
}

export function createEmptyComparison(): Comparison {
  return {
    type: 'comparison',
    left: { type: 'key', value: '' },
    operator: 'eq',
    right: { type: 'literal', value: '' },
  };
}

export function changeOperandType(operand: Operand, newType: OperandType): Operand {
  if (newType === 'null') return { type: 'null', value: '' };
  return { type: newType, value: operand.type === 'null' ? '' : operand.value };
}
