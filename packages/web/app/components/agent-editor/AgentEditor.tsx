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
    <div className="flex h-full w-full">
      <div className="flex min-w-0 flex-[3] flex-col p-4">
        <SystemPromptField value={state.systemPrompt} onChange={actions.handleSystemPromptChange} />
      </div>
      <div className="flex min-w-0 flex-[2] flex-col gap-6 overflow-y-auto border-l bg-muted/20 p-4">
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
