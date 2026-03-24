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

      <div className="flex gap-3 p-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
          <Play className="h-5 w-5 text-green-600" />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {t('description')}
        </p>
      </div>
    </div>
  );
}
