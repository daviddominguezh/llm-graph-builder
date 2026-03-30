'use client';

import type { Operation } from '@daviddh/graph-types';
import { useState } from 'react';

import type { AgentConfigData } from '../../hooks/useGraphLoader';
import { ContextItemsList } from './ContextItemsList';
import { MaxStepsField } from './MaxStepsField';
import { SystemPromptField } from './SystemPromptField';
import { useAgentEditorActions } from './useAgentEditorActions';

interface AgentEditorProps {
  config: AgentConfigData;
  pushOperation: (op: Operation) => void;
  onBackgroundClick?: () => void;
}

function useAgentEditorState(config: AgentConfigData) {
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt);
  const [maxSteps, setMaxSteps] = useState<number | null>(config.maxSteps);
  const [contextItems, setContextItems] = useState(config.contextItems);
  return { systemPrompt, setSystemPrompt, maxSteps, setMaxSteps, contextItems, setContextItems };
}

export function AgentEditor({ config, pushOperation, onBackgroundClick }: AgentEditorProps) {
  const state = useAgentEditorState(config);
  const actions = useAgentEditorActions(state, pushOperation);

  return (
    <div className="flex h-full w-full pt-14.5 bg-muted" onClick={onBackgroundClick}>
      <div className="w-full h-full flex animate-in fade-in duration-300 gap-2 px-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-[3] flex-col p-4 bg-popover rounded-md my-2 border">
          <SystemPromptField value={state.systemPrompt} onChange={actions.handleSystemPromptChange} />
        </div>
        <div className="flex min-w-0 flex-[2] flex-col gap-6 overflow-y-auto bg-popover rounded-md p-4 pt-3.5 my-2 border">
          <ContextItemsList
            items={state.contextItems}
            onInsert={actions.handleInsertItem}
            onUpdate={actions.handleUpdateItem}
            onDelete={actions.handleDeleteItem}
          />
          <MaxStepsField value={state.maxSteps} onChange={actions.handleMaxStepsChange} />
        </div>
      </div>
    </div>
  );
}
