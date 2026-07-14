'use client';

import { type NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';

import { NodeHandle } from './NodeHandle';

function PrevExecNodeComponent({ selected, data }: NodeProps) {
  const label = typeof data.label === 'string' ? data.label : 'Previous';

  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-accent px-6 py-3 ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <span className="text-sm font-semibold uppercase tracking-wide text-accent-foreground">{label}</span>
      <NodeHandle type="source" position={Position.Right} id="right-source" />
    </div>
  );
}

export const PrevExecNode = memo(PrevExecNodeComponent);
