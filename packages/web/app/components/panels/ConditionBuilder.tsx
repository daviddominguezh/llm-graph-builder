'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type {
  Comparison,
  ComparisonOperator,
  ConditionGroup,
  ConditionNode,
  Operand,
  OperandType,
} from '../../types/contextPrecondition';
import { changeOperandType, createEmptyComparison, createEmptyGroup } from '../../types/contextPrecondition';

const COMPARISON_OPERATORS: { value: ComparisonOperator; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '\u2260' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '\u2265' },
  { value: 'lte', label: '\u2264' },
];

// Pure group mutation helpers

function updateChild(group: ConditionGroup, index: number, updated: ConditionNode): ConditionGroup {
  return { ...group, conditions: group.conditions.map((c, i) => (i === index ? updated : c)) };
}

function removeChild(group: ConditionGroup, index: number): ConditionGroup {
  return { ...group, conditions: group.conditions.filter((_, i) => i !== index) };
}

function addChild(group: ConditionGroup, node: ConditionNode): ConditionGroup {
  return { ...group, conditions: [...group.conditions, node] };
}

function toggleOperator(group: ConditionGroup): ConditionGroup {
  return { ...group, operator: group.operator === 'and' ? 'or' : 'and' };
}

// Operand components

function OperandTypeSelect({ value, onChange }: {
  value: OperandType;
  onChange: (t: OperandType) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => { if (v) onChange(v as OperandType); }}>
      <SelectTrigger className="w-16 shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="key">Key</SelectItem>
        <SelectItem value="literal">Value</SelectItem>
        <SelectItem value="null">null</SelectItem>
      </SelectContent>
    </Select>
  );
}

function KeyValueSelect({ value, contextKeys, onChange }: {
  value: string;
  contextKeys: string[];
  onChange: (key: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => { if (v) onChange(v); }}>
      <SelectTrigger className="flex-1">
        <SelectValue placeholder="Select key" />
      </SelectTrigger>
      <SelectContent>
        {contextKeys.map((k) => (
          <SelectItem key={k} value={k}>{k}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OperandEditor({ operand, contextKeys, onChange }: {
  operand: Operand;
  contextKeys: string[];
  onChange: (o: Operand) => void;
}) {
  return (
    <div className="flex items-center gap-1 flex-1">
      <OperandTypeSelect
        value={operand.type}
        onChange={(t) => onChange(changeOperandType(operand, t))}
      />
      {operand.type === 'key' && (
        <KeyValueSelect
          value={operand.value}
          contextKeys={contextKeys}
          onChange={(v) => onChange({ ...operand, value: v })}
        />
      )}
      {operand.type === 'literal' && (
        <Input
          value={operand.value}
          onChange={(e) => onChange({ ...operand, value: e.target.value })}
          placeholder="Value"
          className="flex-1"
        />
      )}
    </div>
  );
}

// Comparison components

function OperatorSelect({ value, onChange }: {
  value: ComparisonOperator;
  onChange: (op: ComparisonOperator) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => { if (v) onChange(v as ComparisonOperator); }}>
      <SelectTrigger className="w-16">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {COMPARISON_OPERATORS.map((op) => (
          <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const DEFAULT_OPERAND: Operand = { type: 'literal', value: '' };

function ComparisonRow({ comparison, contextKeys, onChange, onRemove }: {
  comparison: Comparison;
  contextKeys: string[];
  onChange: (c: ConditionNode) => void;
  onRemove: () => void;
}) {
  const left = comparison.left ?? DEFAULT_OPERAND;
  const right = comparison.right ?? DEFAULT_OPERAND;

  return (
    <div className="space-y-1 rounded border p-2">
      <OperandEditor
        operand={left}
        contextKeys={contextKeys}
        onChange={(newLeft) => onChange({ ...comparison, left: newLeft })}
      />
      <div className="flex items-center gap-1">
        <OperatorSelect
          value={comparison.operator}
          onChange={(operator) => onChange({ ...comparison, operator })}
        />
        <div className="flex-1" />
        <Button variant="ghost" size="icon-xs" onClick={onRemove}>
          <Trash2 className="size-3" />
        </Button>
      </div>
      <OperandEditor
        operand={right}
        contextKeys={contextKeys}
        onChange={(newRight) => onChange({ ...comparison, right: newRight })}
      />
    </div>
  );
}

// Group components

function GroupHeader({ operator, onToggle, onRemove }: {
  operator: 'and' | 'or';
  onToggle: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onToggle}>
        {operator.toUpperCase()}
      </Button>
      {onRemove && (
        <Button variant="ghost" size="icon-xs" onClick={onRemove}>
          <Trash2 className="size-3" />
        </Button>
      )}
    </div>
  );
}

function GroupActions({ onAddComparison, onAddGroup }: {
  onAddComparison: () => void;
  onAddGroup: () => void;
}) {
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" onClick={onAddComparison}>
        <Plus className="size-3 mr-1" />
        Condition
      </Button>
      <Button variant="ghost" size="sm" onClick={onAddGroup}>
        <Plus className="size-3 mr-1" />
        Group
      </Button>
    </div>
  );
}

function ConditionNodeEditor({ node, contextKeys, onChange, onRemove }: {
  node: ConditionNode;
  contextKeys: string[];
  onChange: (n: ConditionNode) => void;
  onRemove: () => void;
}) {
  if (node.type === 'comparison') {
    return (
      <ComparisonRow
        comparison={node}
        contextKeys={contextKeys}
        onChange={onChange}
        onRemove={onRemove}
      />
    );
  }
  return (
    <ConditionGroupEditor
      group={node}
      contextKeys={contextKeys}
      onChange={onChange}
      onRemove={onRemove}
    />
  );
}

function ConditionGroupEditor({ group, contextKeys, onChange, onRemove }: {
  group: ConditionGroup;
  contextKeys: string[];
  onChange: (g: ConditionNode) => void;
  onRemove?: () => void;
}) {
  const borderColor = group.operator === 'and' ? 'border-blue-300' : 'border-orange-300';

  return (
    <div className={`border-l-2 ${borderColor} pl-3 space-y-2`}>
      <GroupHeader
        operator={group.operator}
        onToggle={() => onChange(toggleOperator(group))}
        onRemove={onRemove}
      />
      {group.conditions.map((child, index) => (
        <ConditionNodeEditor
          key={index}
          node={child}
          contextKeys={contextKeys}
          onChange={(updated) => onChange(updateChild(group, index, updated))}
          onRemove={() => onChange(removeChild(group, index))}
        />
      ))}
      <GroupActions
        onAddComparison={() => onChange(addChild(group, createEmptyComparison()))}
        onAddGroup={() => onChange(addChild(group, createEmptyGroup()))}
      />
    </div>
  );
}

export function ConditionBuilder({ root, contextKeys, onChange }: {
  root: ConditionGroup;
  contextKeys: string[];
  onChange: (root: ConditionGroup) => void;
}) {
  return (
    <ConditionGroupEditor
      group={root}
      contextKeys={contextKeys}
      onChange={(updated) => onChange(updated as ConditionGroup)}
    />
  );
}
