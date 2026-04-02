'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { ArrowRight } from 'lucide-react';
import { memo } from 'react';

import { HANDLE_SIZE, ICON_SIZE } from './HandleContent';

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

const RightSourceContent = (
  <div className="relative w-full h-full flex flex-col justify-center items-center border rounded-full border-input">
    <ArrowRight size={ICON_SIZE} className="absolute text-accent" style={{ transform: 'rotate(0deg)' }} />
  </div>
);

function PrevExecNodeComponent({ selected, data }: NodeProps) {
  const label = typeof data.label === 'string' ? data.label : 'Previous';

  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-accent px-6 py-3 ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <span className="text-sm font-semibold uppercase tracking-wide text-accent-foreground">{label}</span>
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        style={rightSourceStyle}
      >
        {RightSourceContent}
      </Handle>
    </div>
  );
}

export const PrevExecNode = memo(PrevExecNodeComponent);
