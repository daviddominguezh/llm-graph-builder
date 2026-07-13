'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';

import { HANDLE_COLOR, HANDLE_HEIGHT, HANDLE_WIDTH } from './HandleContent';

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

function PrevExecNodeComponent({ selected, data }: NodeProps) {
  const label = typeof data.label === 'string' ? data.label : 'Previous';

  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-accent px-6 py-3 ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <span className="text-sm font-semibold uppercase tracking-wide text-accent-foreground">{label}</span>
      <Handle type="source" position={Position.Right} id="right-source" style={rightSourceStyle} />
    </div>
  );
}

export const PrevExecNode = memo(PrevExecNodeComponent);
