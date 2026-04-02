'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { GitFork, MessageSquare, Repeat, Send, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ExistingEdgeType } from '../../utils/edgeTypeUtils';

type NodeCreationType = 'agent' | 'user' | 'tool' | 'ifElse' | 'loop';

interface NodeTypeDropdownProps {
  sourceEdgeType: ExistingEdgeType;
  isStartNode: boolean;
  onSelect: (type: NodeCreationType) => void;
  children: React.ReactNode;
}

interface OptionConfig {
  type: NodeCreationType;
  labelKey: string;
  icon: React.ReactNode;
  colorClass: string;
}

const OPTIONS: OptionConfig[] = [
  { type: 'agent', labelKey: 'agentNode', icon: <Send className="h-3.5 w-3.5" />, colorClass: 'text-muted-foreground' },
  { type: 'user', labelKey: 'userNode', icon: <MessageSquare className="h-3.5 w-3.5" />, colorClass: 'text-green-600' },
  { type: 'tool', labelKey: 'toolNode', icon: <Wrench className="h-3.5 w-3.5" />, colorClass: 'text-orange-600' },
  { type: 'ifElse', labelKey: 'ifElse', icon: <GitFork className="h-3.5 w-3.5" />, colorClass: 'text-purple-600' },
  { type: 'loop', labelKey: 'loop', icon: <Repeat className="h-3.5 w-3.5" />, colorClass: 'text-purple-600' },
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
  if (optionType === 'loop') return true; // Loop handles compatibility in its dialog
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

function DropdownOption({
  config,
  disabled,
  disabledReason,
  onSelect,
  label,
}: {
  config: OptionConfig;
  disabled: boolean;
  disabledReason: string | null;
  onSelect: () => void;
  label: string;
}) {
  const item = (
    <DropdownMenuItem disabled={disabled} onClick={onSelect}>
      <span className={config.colorClass}>{config.icon}</span>
      {label}
    </DropdownMenuItem>
  );

  if (disabledReason === null) return item;

  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>
        {item}
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {disabledReason}
      </TooltipContent>
    </Tooltip>
  );
}

export function NodeTypeDropdown({ sourceEdgeType, isStartNode: startNode, onSelect, children }: NodeTypeDropdownProps) {
  const t = useTranslations('connectionMenu');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={children as React.ReactElement} />
      <DropdownMenuContent align="end" className="w-44">
        {OPTIONS.map((config) => {
          const disabled = !isOptionEnabled(config.type, sourceEdgeType, startNode);
          const reason = getDisabledReason(config.type, sourceEdgeType, startNode, t);
          return (
            <DropdownOption
              key={config.type}
              config={config}
              disabled={disabled}
              disabledReason={reason}
              onSelect={() => onSelect(config.type)}
              label={t(config.labelKey)}
            />
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type { NodeCreationType };
