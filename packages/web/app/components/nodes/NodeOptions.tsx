import { Button } from '@/components/ui/button';
import { type Edge } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { memo } from 'react';

import type { RFEdgeData } from '../../utils/graphTransformers';
import type { NodeKind } from '../../utils/nodeKind';
import { useHandleContext } from './HandleContext';
import { NodeOptionRow } from './NodeOptionRow';

interface NodeOptionsProps {
  nodeId: string;
  nodeKind: NodeKind;
  options: Edge<RFEdgeData>[];
  hasBody?: boolean;
}

const NodeOptionsComponent = ({ nodeId, nodeKind, options, hasBody = true }: NodeOptionsProps) => {
  const t = useTranslations('nodePanel');
  const { onDeleteOption, onAddOption, readOnly } = useHandleContext();

  return (
    <div
      className={`flex-1 min-h-[0px] group/options px-2 ${hasBody ? 'pt-0' : 'pt-2'} flex flex-col justify-between`}
    >
      <div>
        <div className="shrink-0 uppercase text-[10px] text-muted-foreground font-medium">{t('options')}</div>
        <div className="flex flex-col gap-3 mt-1 shrink-0">
          {options.map((edge) => (
            <React.Fragment key={edge.id}>
              <NodeOptionRow
                edge={edge}
                onDelete={() => onDeleteOption?.(edge.id, edge.source, edge.target)}
              />
            </React.Fragment>
          ))}
        </div>
      </div>
      {!readOnly && (
        <div className="flex flex-col mt-1 py-2 gap-1 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-sm"
            onClick={(e) => {
              e.stopPropagation();
              onAddOption?.(nodeId, nodeKind, e);
            }}
          >
            <Plus />
            {t('addOption')}
          </Button>
        </div>
      )}
    </div>
  );
};

export const NodeOptions = memo(NodeOptionsComponent);
