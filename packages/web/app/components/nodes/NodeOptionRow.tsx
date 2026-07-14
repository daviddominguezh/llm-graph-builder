import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type Edge, Handle, Position } from '@xyflow/react';
import { ArrowRight, Box, Cable, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import type { RFEdgeData } from '../../utils/graphTransformers';
import { getPreconditionDisplayValue } from '../../utils/preconditionHelpers';
import { HANDLE_COLOR, HANDLE_HEIGHT, HANDLE_WIDTH } from './HandleContent';
import { useHandleContext } from './HandleContext';

interface NodeOptionRowProps {
  edge: Edge<RFEdgeData>;
  onDelete: () => void;
}

const rowHandleStyle = {
  width: `${HANDLE_WIDTH}px`,
  height: `${HANDLE_HEIGHT}px`,
  borderTopRightRadius: '100px',
  borderBottomRightRadius: '100px',
  border: 'none',
  backgroundColor: HANDLE_COLOR,
  right: `-${HANDLE_WIDTH / 2}px`,
  top: '50%',
} as const;

// Kept in the DOM during simulation (so the row's edge stays anchored) but invisible.
const hiddenRowHandleStyle = { ...rowHandleStyle, opacity: 0, pointerEvents: 'none' } as const;

const NodeOptionRowComponent = ({ edge, onDelete }: NodeOptionRowProps) => {
  const t = useTranslations('nodePanel');
  const { readOnly, hideHandles } = useHandleContext();
  const first = edge.data?.preconditions?.[0];
  const label = first === undefined ? edge.target : getPreconditionDisplayValue(first);

  return (
    <div className="group relative flex items-end gap-1">
      <div className="min-w-0 flex-1 ml-0.5 border-l border-l-muted-foreground/60 pl-1.5">
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
          <div className="line-clamp-1!">{edge.target}</div>
        </div>
      </div>
      {!readOnly && (
        <div className="flex gap-1">
          <Button
            variant="secondary"
            size="icon-xs"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Open node
            }}
          >
            <Box />
          </Button>
          <Button
            variant="secondary"
            size="icon-xs"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Open edge
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
      <Handle
        type="source"
        position={Position.Right}
        id={edge.id}
        className="-right-[calc(3px+calc(var(--spacing)*3))]!"
        style={hideHandles === true ? hiddenRowHandleStyle : rowHandleStyle}
      />
    </div>
  );
};

export const NodeOptionRow = memo(NodeOptionRowComponent);
