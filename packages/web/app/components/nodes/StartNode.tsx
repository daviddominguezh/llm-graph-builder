'use client';

import { Separator } from '@/components/ui/separator';
import { type NodeProps, Position, useEdges } from '@xyflow/react';
import type { Edge } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { memo } from 'react';

import type { RFEdgeData } from '../../utils/graphTransformers';
import { type NodeKind, getNodeKind, isRowModeNodeKind } from '../../utils/nodeKind';
import { useHandleContext } from './HandleContext';
import { NodeHandle } from './NodeHandle';
import { NodeOptions } from './NodeOptions';
import { useSortedOptions } from './useSortedOptions';

const LABEL_CLASS = 'w-full flex justify-center text-sm uppercase font-mono font-semibold tracking-wide';

function StartBadge({ label }: { label: string }) {
  return (
    <div className="w-full flex justify-center absolute h-[30px] -top-[20px] -z-[1]">
      <div className="flex items-center justify-center w-full h-full bg-[#22c55e] rounded-ss-lg rounded-se-lg text-white font-semibold font-mono text-[10px] uppercase">
        <div className="mb-[10px]">{label}</div>
      </div>
    </div>
  );
}

interface StartRowContentProps {
  id: string;
  nodeKind: NodeKind;
  options: Edge<RFEdgeData>[];
  startLabel: string;
}

function StartRowContent({ id, nodeKind, options, startLabel }: StartRowContentProps) {
  return (
    <>
      <div className={`px-4 py-2 ${LABEL_CLASS}`}>{startLabel}</div>
      <Separator />
      <NodeOptions hasBody={false} nodeId={id} nodeKind={nodeKind} options={options} />
    </>
  );
}

interface StartPillContentProps {
  id: string;
  hidden: boolean;
  startLabel: string;
  onSourceHandleClick?: (nodeId: string, handleId: string, event: React.MouseEvent) => void;
}

function StartPillContent({ id, hidden, startLabel, onSourceHandleClick }: StartPillContentProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSourceHandleClick?.(id, 'right-source', e);
  };
  const preventDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      <span className={LABEL_CLASS}>{startLabel}</span>
      <NodeHandle
        type="source"
        position={Position.Right}
        id="right-source"
        interactive={!hidden}
        hidden={hidden}
        onClick={handleClick}
        onMouseDown={preventDrag}
      />
    </>
  );
}

function StartNodeComponent({ selected, id }: NodeProps) {
  const t = useTranslations('nodePanel');
  const { onSourceHandleClick, hideHandles } = useHandleContext();
  const edges = useEdges<Edge<RFEdgeData>>();
  const nodeKind = getNodeKind(id, edges);
  const rowMode = isRowModeNodeKind(nodeKind);
  const options = useSortedOptions(id, rowMode, edges);

  const base = 'relative ring ring-[1.5px] ring-input rounded-lg bg-popover';
  const shape = rowMode ? 'flex flex-col w-[180px]' : 'flex items-center justify-center px-6 py-3';
  const sel = selected ? 'ring-2 ring-primary' : '';

  return (
    <div className={`${base} ${shape} ${sel}`}>
      <StartBadge label={t('inputNode')} />
      {rowMode ? (
        <StartRowContent id={id} nodeKind={nodeKind} options={options} startLabel={t('start')} />
      ) : (
        <StartPillContent
          id={id}
          hidden={hideHandles === true}
          startLabel={t('start')}
          onSourceHandleClick={onSourceHandleClick}
        />
      )}
    </div>
  );
}

export const StartNode = memo(StartNodeComponent);
