'use client';

import type { Node } from '@xyflow/react';
import { useTranslations } from 'next-intl';
import { Play } from 'lucide-react';

import type { Agent } from '../../schemas/graph.schema';
import type { ContextPreset } from '../../types/preset';
import type { RFNodeData } from '../../utils/graphTransformers';
import type { OutputSchemaEntity } from '@daviddh/graph-types';
import { NodePromptDialog } from './NodePromptDialog';

interface StartNodePanelProps {
  nodeId: string;
  allNodes: Array<Node<RFNodeData>>;
  agents: Agent[];
  presets: ContextPreset[];
  activePresetId: string;
  onSetActivePreset: (id: string) => void;
  outputSchemas: OutputSchemaEntity[];
}

export function StartNodePanel(props: StartNodePanelProps) {
  const t = useTranslations('startNodePanel');

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-2 px-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">{t('title')}</h4>
          <NodePromptDialog
            nodeId={props.nodeId}
            allNodes={props.allNodes}
            agents={props.agents}
            presets={props.presets}
            activePresetId={props.activePresetId}
            onSetActivePreset={props.onSetActivePreset}
            outputSchemas={props.outputSchemas}
          />
        </div>
      </div>

      <div className="flex gap-3 p-3 bg-card m-3 items-center rounded-md border">
        <div className="flex p-1.5 aspect-1/1 w-fit h-fit shrink-0 items-center justify-center rounded-full bg-green-100 border border-green-600">
          <Play className="h-3.5 w-3.5 text-green-600" />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('description')}
        </p>
      </div>
    </div>
  );
}
