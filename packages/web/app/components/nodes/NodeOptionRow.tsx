import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type Edge, Position } from '@xyflow/react';
import { ArrowRight, Box, Cable, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import type { RFEdgeData } from '../../utils/graphTransformers';
import { getPreconditionDisplayValue } from '../../utils/preconditionHelpers';
import { useHandleContext } from './HandleContext';
import { NodeHandle } from './NodeHandle';

interface NodeOptionRowProps {
  edge: Edge<RFEdgeData>;
  onDelete: () => void;
}

const NodeOptionRowComponent = ({ edge, onDelete }: NodeOptionRowProps) => {
  const t = useTranslations('nodePanel');
  const { readOnly, hideHandles, onOpenNode, onOpenEdge } = useHandleContext();
  const first = edge.data?.preconditions?.[0];
  const label = first === undefined ? edge.target : getPreconditionDisplayValue(first);

  return (
    <div className="group relative flex items-end gap-1">
      <div className="relative min-w-0 flex-1 ml-0.5 border-l border-l-muted-foreground/60 pl-1.5">
        <Tooltip>
          <TooltipTrigger className="line-clamp-2! block text-left text-[9px] italic text-foreground leading-[10px]">
            “{label}”
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm">
            {label}
          </TooltipContent>
        </Tooltip>
        <div className="flex items-center text-[9px] text-muted-foreground gap-1">
          <ArrowRight className="h-2 w-2" />
          <div className="line-clamp-1! font-mono">{edge.target}</div>
        </div>

        {!readOnly && (
          <div className="opacity-0 transition-opacity group-hover:opacity-100 absolute bg-popover py-0.5 px-1 rounded-sm bottom-0 right-0 flex gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('openNode')}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onOpenNode?.(edge.target);
              }}
            >
              <Box />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('openEdge')}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEdge?.(edge.id);
              }}
            >
              <Cable />
            </Button>
            <Button
              variant="destructive"
              size="icon-xs"
              aria-label={t('deleteOption')}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>

      <NodeHandle
        type="source"
        position={Position.Right}
        id={edge.id}
        readOnly={readOnly === true}
        hidden={hideHandles === true}
        isFromInnerOption
      />
    </div>
  );
};

export const NodeOptionRow = memo(NodeOptionRowComponent);
