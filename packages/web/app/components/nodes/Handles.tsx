import { Handle, Position } from '@xyflow/react';
import { memo } from 'react';

import { HANDLE_COLOR, HANDLE_HEIGHT, HANDLE_WIDTH } from './HandleContent';
import { useHandleContext } from './HandleContext';

// Pre-rendered static handle style objects - never recreate
const rectBase = {
  zIndex: '10',
  width: `${HANDLE_WIDTH}px`,
  height: `${HANDLE_HEIGHT}px`,
  border: 'none',
  backgroundColor: HANDLE_COLOR,
  cursor: 'pointer',
  top: '50%',
} as const;

const readOnlyBase = {
  ...rectBase,
  cursor: 'default',
  pointerEvents: 'none',
} as const;

// In simulation mode the handles stay in the DOM (so edges keep their anchor)
// but are rendered invisible.
const hiddenBase = {
  ...rectBase,
  opacity: 0,
  pointerEvents: 'none',
} as const;

interface HandlesProps {
  nodeId: string;
  rowMode?: boolean;
}

function pickBase(
  readOnly: boolean,
  hidden: boolean
): typeof rectBase | typeof readOnlyBase | typeof hiddenBase {
  if (hidden) return hiddenBase;
  return readOnly ? readOnlyBase : rectBase;
}

function HandlesComponent({ nodeId, rowMode }: HandlesProps) {
  const { onSourceHandleClick, readOnly, hideHandles } = useHandleContext();
  const hidden = hideHandles === true;
  const interactive = !readOnly && !hidden;
  const style = pickBase(readOnly === true, hidden);

  const handleSourceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSourceHandleClick?.(nodeId, 'right-source', e);
  };

  const preventDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        style={style}
        className="-left-[3px]! rounded-s-full"
      />
      {/* In row mode each option row renders its own right-anchored source handle. */}
      {!rowMode && (
        <Handle
          type="source"
          position={Position.Right}
          id="right-source"
          className="-right-[3px]! rounded-e-full"
          style={style}
          onClick={interactive ? handleSourceClick : undefined}
          onMouseDown={interactive ? preventDrag : undefined}
        />
      )}
    </>
  );
}

export const Handles = memo(HandlesComponent);
