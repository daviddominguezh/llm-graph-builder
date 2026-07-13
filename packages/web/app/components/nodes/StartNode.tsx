'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';

import { HANDLE_COLOR, HANDLE_HEIGHT, HANDLE_WIDTH } from './HandleContent';
import { useHandleContext } from './HandleContext';

const rightSourceStyle = {
  width: `${HANDLE_WIDTH}px`,
  height: `${HANDLE_HEIGHT}px`,
  borderTopRightRadius: '100px',
  borderBottomRightRadius: '100px',
  border: 'none',
  cursor: 'pointer',
  backgroundColor: HANDLE_COLOR,
  top: '50%',
} as const;

const hiddenRightSourceStyle = { ...rightSourceStyle, opacity: 0, pointerEvents: 'none' } as const;

function StartNodeComponent({ selected, id }: NodeProps) {
  const { onSourceHandleClick, hideHandles } = useHandleContext();
  const hidden = hideHandles === true;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSourceHandleClick?.(id, 'right-source', e);
  };

  const preventDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-green-500 px-6 py-3 ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <span className="text-sm font-semibold uppercase tracking-wide text-white">Start</span>
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        onClick={hidden ? undefined : handleClick}
        onMouseDown={hidden ? undefined : preventDrag}
        style={hidden ? hiddenRightSourceStyle : rightSourceStyle}
      />
    </div>
  );
}

export const StartNode = memo(StartNodeComponent);
