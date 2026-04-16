'use client';

import type { Operation } from '@daviddh/graph-types';
import { useEffect, useState } from 'react';

import type { AgentConfigData } from '../../hooks/useGraphLoader';
import type { SkillEntry } from './AddSkillDialog';
import { ContextItemsList } from './ContextItemsList';
import { MaxStepsField } from './MaxStepsField';
import { SkillsList } from './SkillsList';
import { SystemPromptField } from './SystemPromptField';
import { VfsConfigSection } from './VfsConfigSection';
import { useAgentEditorActions } from './useAgentEditorActions';
import { useSkillActions } from './useSkillActions';

interface AgentEditorProps {
  config: AgentConfigData;
  pushOperation: (op: Operation) => void;
  onBackgroundClick?: () => void;
  insets: { top: number; left: number; right: number; bottom: number };
  onConfigChange?: (config: AgentConfigData) => void;
  agentId?: string;
  orgId?: string;
}

function useAgentEditorState(config: AgentConfigData) {
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt);
  const [maxSteps, setMaxSteps] = useState<number | null>(config.maxSteps);
  const [contextItems, setContextItems] = useState(config.contextItems);
  const [skills, setSkills] = useState<SkillEntry[]>(
    config.skills.map((s) => ({
      name: s.name,
      description: s.description,
      content: s.content,
      repoUrl: s.repoUrl,
    }))
  );
  return {
    systemPrompt,
    setSystemPrompt,
    maxSteps,
    setMaxSteps,
    contextItems,
    setContextItems,
    skills,
    setSkills,
  };
}

export function AgentEditor({
  config,
  pushOperation,
  onBackgroundClick,
  onConfigChange,
  agentId,
  orgId,
  insets,
}: AgentEditorProps) {
  const state = useAgentEditorState(config);
  const actions = useAgentEditorActions(state, pushOperation);
  const skillActions = useSkillActions(state.setSkills, pushOperation);

  useEffect(() => {
    onConfigChange?.({
      systemPrompt: state.systemPrompt,
      maxSteps: state.maxSteps,
      contextItems: state.contextItems,
      skills: state.skills.map((s, i) => ({ ...s, sortOrder: i })),
    });
  }, [state.systemPrompt, state.maxSteps, state.contextItems, state.skills, onConfigChange]);

  // packages/web/app/components/agent-editor/AgentEditor.tsx
  console.log(insets);

  return (
    <div className="absolute pepeg" style={insets} onClick={onBackgroundClick}>
      <div className="flex h-full w-full bg-background px-1.5 pb-1.5">
        <div
          className="w-full h-full flex animate-in fade-in duration-300 gap-1 px-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 flex-1 shrink-0 flex-col p-4 bg-popover rounded-md mt-2 mb-0 border">
            <SystemPromptField value={state.systemPrompt} onChange={actions.handleSystemPromptChange} />
          </div>
          <div className="flex min-w-0 flex-1 shrink-0 flex-col gap-6 overflow-y-auto bg-popover rounded-md p-4 pt-3.5 mt-2 pb-12 border">
            <SkillsList
              skills={state.skills}
              onAdd={skillActions.handleAddSkills}
              onDelete={skillActions.handleDeleteSkill}
              onDeleteMany={skillActions.handleDeleteManySkills}
            />
            <ContextItemsList
              items={state.contextItems}
              onInsert={actions.handleInsertItem}
              onUpdate={actions.handleUpdateItem}
              onDelete={actions.handleDeleteItem}
            />
            <MaxStepsField value={state.maxSteps} onChange={actions.handleMaxStepsChange} />
            {agentId !== undefined && orgId !== undefined && (
              <VfsConfigSection agentId={agentId} orgId={orgId} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
