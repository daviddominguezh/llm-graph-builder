import { Button } from '@/components/ui/button';
import { Play, Send, Shrink, Split, UserRoundPen } from 'lucide-react';
import { memo } from 'react';

import { useHandleContext } from './HandleContext';

export type NodeKind = 'agent' | 'user_routing' | 'agent_decision' | 'tool_call';

interface NodeHeaderProps {
  nodeKind: NodeKind;
  agent?: string;
  nodeId: string;
}

const NodeHeaderComponent = ({ nodeKind, nodeId }: NodeHeaderProps) => {
  const { onZoomToNode } = useHandleContext();
  let headerLabel: string;
  let headerIcon: React.ReactNode;
  let colorClass: string;

  const iconClass = 'h-3.5 w-3.5 text-white';

  switch (nodeKind) {
    case 'user_routing':
      headerLabel = 'User Input';
      colorClass = 'bg-green-700';
      headerIcon = <UserRoundPen className={iconClass} />;
      break;
    case 'agent_decision':
      headerLabel = 'LLM Decision';
      colorClass = 'bg-purple-700';
      headerIcon = <Split className={iconClass} />;
      break;
    case 'tool_call':
      headerLabel = 'Tool call';
      colorClass = 'bg-orange-700';
      headerIcon = <Play className={iconClass} />;
      break;
    default:
      headerLabel = 'Execution';
      colorClass = 'bg-muted-foreground';
      headerIcon = <Send className={iconClass} />;
  }

  return (
    <div className="flex justify-between items-center group">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className={`${colorClass} rounded-sm flex items-center justify-center p-1`}>{headerIcon}</div>
        <span className={`text-xs font-medium uppercase`}>{headerLabel}</span>
      </div>

      <Button
        variant="ghost"
        size="icon-lg"
        className="mr-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onZoomToNode?.(nodeId);
        }}
      >
        <Shrink className="h-3 w-3" />
      </Button>
    </div>
  );
};

export const NodeHeader = memo(
  NodeHeaderComponent,
  (prev, next) => prev.nodeKind === next.nodeKind && prev.agent === next.agent && prev.nodeId === next.nodeId
);
