'use client';

import { Handle, type NodeProps, Position } from '@xyflow/react';
import { useTranslations } from 'next-intl';
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
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        onClick={hidden ? undefined : handleClick}
        onMouseDown={hidden ? undefined : preventDrag}
        className="-right-[3px]! rounded-e-full! rounded-s-none!"
        style={hidden ? hiddenRightSourceStyle : rightSourceStyle}
      />
    </div>
  );
}

export const StartNode = memo(StartNodeComponent);
