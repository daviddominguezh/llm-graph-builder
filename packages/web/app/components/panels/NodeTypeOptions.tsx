'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GitFork, ListTodo, Play, Repeat, UserRoundPen } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ExistingEdgeType } from '../../utils/edgeTypeUtils';

type NodeCreationType = 'agent' | 'user' | 'tool' | 'ifElse' | 'loop';

interface OptionConfig {
  type: NodeCreationType;
  labelKey: string;
  hintKey?: string;
  icon: React.ReactNode;
  colorClass: string;
}

const SINGLE_OPTIONS: OptionConfig[] = [
  {
    type: 'agent',
    labelKey: 'agentNode',
    icon: <ListTodo className="h-3.5 w-3.5" />,
    colorClass: 'text-muted-foreground',
  },
  {
    type: 'user',
    labelKey: 'userNode',
    icon: <UserRoundPen className="h-3.5 w-3.5" />,
    colorClass: 'text-green-600',
  },
  {
    type: 'tool',
    labelKey: 'toolNode',
    icon: <Play className="h-3.5 w-3.5" />,
    colorClass: 'text-orange-600',
  },
];

const STRUCTURE_OPTIONS: OptionConfig[] = [
  {
    type: 'ifElse',
    labelKey: 'ifElse',
    hintKey: 'ifElseHint',
    icon: <GitFork className="h-3.5 w-3.5" />,
    colorClass: 'text-purple-600',
  },
  {
    type: 'loop',
    labelKey: 'loop',
    hintKey: 'loopHint',
    icon: <Repeat className="h-3.5 w-3.5" />,
    colorClass: 'text-purple-600',
  },
];

const EDGE_TYPE_MAP: Record<NodeCreationType, ExistingEdgeType | 'special'> = {
  agent: 'none',
  user: 'user_said',
  tool: 'tool_call',
  ifElse: 'agent_decision',
  loop: 'special',
};

function isOptionEnabled(
  optionType: NodeCreationType,
  sourceEdgeType: ExistingEdgeType,
  startNode: boolean
): boolean {
  if (startNode) return optionType === 'user';
  if (sourceEdgeType === 'unset') return true;
  if (optionType === 'loop') return true;
  return EDGE_TYPE_MAP[optionType] === sourceEdgeType;
}

function getDisabledReason(
  optionType: NodeCreationType,
  sourceEdgeType: ExistingEdgeType,
  startNode: boolean,
  t: (key: string, values?: Record<string, string>) => string
): string | null {
  if (isOptionEnabled(optionType, sourceEdgeType, startNode)) return null;
  if (startNode) return t('disabledStartNode');
  return t('disabledIncompatibleEdges', { edgeType: sourceEdgeType });
}

function NodeTypeOption({
  config,
  disabled,
  disabledReason,
  onSelect,
  label,
  hint,
}: {
  config: OptionConfig;
  disabled: boolean;
  disabledReason: string | null;
  onSelect: () => void;
  label: string;
  hint?: string;
}) {
  const item = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      onClick={onSelect}
      className="cursor-pointer h-auto w-full justify-start gap-2 py-0.5 font-normal rounded-sm"
    >
      <span className={config.colorClass}>{config.icon}</span>
      <span className="w-full flex justify-between items-center gap-1">
        <span className="flex w-[82px]">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground leading-tight">{hint}</span>}
      </span>
    </Button>
  );

  if (disabledReason === null) return item;

  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>{item}</TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {disabledReason}
      </TooltipContent>
    </Tooltip>
  );
}

interface NodeTypeOptionsProps {
  sourceEdgeType: ExistingEdgeType;
  isStartNode: boolean;
  onSelect: (type: NodeCreationType) => void;
}

function renderOptions(
  options: OptionConfig[],
  sourceEdgeType: ExistingEdgeType,
  startNode: boolean,
  onSelect: (type: NodeCreationType) => void,
  t: (key: string, values?: Record<string, string>) => string
) {
  return options.map((config) => {
    const disabled = !isOptionEnabled(config.type, sourceEdgeType, startNode);
    const reason = getDisabledReason(config.type, sourceEdgeType, startNode, t);
    return (
      <NodeTypeOption
        key={config.type}
        config={config}
        disabled={disabled}
        disabledReason={reason}
        onSelect={() => onSelect(config.type)}
        label={t(config.labelKey)}
        hint={config.hintKey ? t(config.hintKey) : undefined}
      />
    );
  });
}

export function NodeTypeOptions({ sourceEdgeType, isStartNode: startNode, onSelect }: NodeTypeOptionsProps) {
  const t = useTranslations('connectionMenu');

  return (
    <div className="flex flex-col gap-0.5">
      {renderOptions(SINGLE_OPTIONS, sourceEdgeType, startNode, onSelect, t)}
      {renderOptions(STRUCTURE_OPTIONS, sourceEdgeType, startNode, onSelect, t)}
    </div>
  );
}

export type { NodeCreationType };
