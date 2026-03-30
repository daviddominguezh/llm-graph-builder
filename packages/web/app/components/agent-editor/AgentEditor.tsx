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
}

function useAgentEditorState(config: AgentConfigData) {
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt);
  const [maxSteps, setMaxSteps] = useState<number | null>(config.maxSteps);
  const [contextItems, setContextItems] = useState(config.contextItems);
  return { systemPrompt, setSystemPrompt, maxSteps, setMaxSteps, contextItems, setContextItems };
}

export function AgentEditor({ config, pushOperation }: AgentEditorProps) {
  const state = useAgentEditorState(config);
  const actions = useAgentEditorActions(state, pushOperation);

  return (
    <div className="flex h-full w-full items-start justify-center overflow-y-auto p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6 pb-24">
        <SystemPromptField value={state.systemPrompt} onChange={actions.handleSystemPromptChange} />
        <ContextItemsList
          items={state.contextItems}
          onInsert={actions.handleInsertItem}
          onUpdate={actions.handleUpdateItem}
          onDelete={actions.handleDeleteItem}
        />
        <MaxStepsField value={state.maxSteps} onChange={actions.handleMaxStepsChange} />
      </div>
    </div>
  );
}
