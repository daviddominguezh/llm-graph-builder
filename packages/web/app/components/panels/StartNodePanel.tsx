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
          <h4 className="text-xs font-semibold cursor-default">{t('title')}</h4>
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

      <div className="flex gap-3 p-3 bg-input/70 m-3 items-center rounded-md">
        <div className="flex p-1.5 aspect-1/1 w-fit h-fit shrink-0 items-center justify-center rounded-full border border-[calc(var(--spacing)*0.4)] border-green-400 dark:border-green-600">
          <Play strokeWidth={2.5} className="h-3.5 w-3.5 text-green-500 dark:text-green-600" />
        </div>
        <p className="text-xs text-muted-foreground cursor-default">
          {t('description')}
        </p>
      </div>
    </div>
  );
}
