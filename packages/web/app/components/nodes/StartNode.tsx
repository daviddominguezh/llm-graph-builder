'use client';

import { type NodeProps, Position } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import { useHandleContext } from './HandleContext';
import { NodeHandle } from './NodeHandle';

function StartNodeComponent({ selected, id }: NodeProps) {
  const t = useTranslations('nodePanel');

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
      className={`relative ring ring-[1.5px] ring-green-500 flex items-center justify-center rounded-lg bg-popover px-6 py-3 ${
        selected ? 'ring-2 ring-primary' : ''
      }`}
    >
      <div className="w-full flex justify-center absolute h-[30px] -top-[20px] -z-[1]">
        <div className="flex items-center justify-center w-full h-full bg-[#22c55e] rounded-ss-lg rounded-se-lg text-white font-semibold font-mono text-[10px] uppercase">
          <div className="mb-[10px]">{t('inputNode')}</div>
        </div>
      </div>
      <span className="text-sm uppercase font-mono font-semibold uppercase tracking-wide">{t('start')}</span>
      <NodeHandle
        type="source"
        position={Position.Right}
        id="right-source"
        interactive={!hidden}
        hidden={hidden}
        onClick={handleClick}
        onMouseDown={preventDrag}
      />
    </div>
  );
}

export const StartNode = memo(StartNodeComponent);
