'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { ArrowRight } from 'lucide-react';
import { memo } from 'react';

import { HANDLE_SIZE, ICON_SIZE } from './HandleContent';
import { useHandleContext } from './HandleContext';

const rightSourceStyle = {
  width: `${HANDLE_SIZE}px`,
  height: `${HANDLE_SIZE}px`,
  borderWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  backgroundColor: 'var(--background)',
  top: '50%',
} as const;

const RightSourceContentGreen = (
  <div className="relative w-full h-full flex flex-col justify-center items-center border rounded-full border-input">
    <ArrowRight size={ICON_SIZE} className="absolute text-green-500" style={{ transform: 'rotate(0deg)' }} />
  </div>
);

function StartNodeComponent({ selected, id }: NodeProps) {
  const { onSourceHandleClick } = useHandleContext();

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
        onClick={handleClick}
        onMouseDown={preventDrag}
        style={rightSourceStyle}
      >
        {RightSourceContentGreen}
      </Handle>
    </div>
  );
}

export const StartNode = memo(StartNodeComponent);
