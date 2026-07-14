import { Position } from '@xyflow/react';
import { memo } from 'react';

import { useHandleContext } from './HandleContext';
import { NodeHandle } from './NodeHandle';

interface HandlesProps {
  nodeId: string;
  rowMode?: boolean;
}

function HandlesComponent({ nodeId, rowMode }: HandlesProps) {
  const { onSourceHandleClick, readOnly, hideHandles } = useHandleContext();
  const hidden = hideHandles === true;
  const ro = readOnly === true;
  const interactive = !ro && !hidden;

  const handleSourceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSourceHandleClick?.(nodeId, 'right-source', e);
  };

  const preventDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      <NodeHandle type="target" position={Position.Left} id="left-target" readOnly={ro} hidden={hidden} />
      {/* In row mode each option row renders its own right-anchored source handle. */}
      {!rowMode && (
        <NodeHandle
          type="source"
          position={Position.Right}
          id="right-source"
          interactive={interactive}
          readOnly={ro}
          hidden={hidden}
          onClick={handleSourceClick}
          onMouseDown={preventDrag}
        />
      )}
    </>
  );
}

export const Handles = memo(HandlesComponent);
