'use client';

import type { Operation } from '@daviddh/graph-types';
import { useCallback, useEffect, useState } from 'react';

import type { AgentConfigData } from '../../hooks/useGraphLoader';
import type { SkillEntry } from './AddSkillDialog';
import { ContextItemsList } from './ContextItemsList';
import { MaxStepsField } from './MaxStepsField';
import { SkillsList } from './SkillsList';
import { SystemPromptField } from './SystemPromptField';
import { useAgentEditorActions } from './useAgentEditorActions';

interface AgentEditorProps {
  config: AgentConfigData;
  pushOperation: (op: Operation) => void;
  onBackgroundClick?: () => void;
  onConfigChange?: (config: AgentConfigData) => void;
}

function useAgentEditorState(config: AgentConfigData) {
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt);
  const [maxSteps, setMaxSteps] = useState<number | null>(config.maxSteps);
  const [contextItems, setContextItems] = useState(config.contextItems);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  return { systemPrompt, setSystemPrompt, maxSteps, setMaxSteps, contextItems, setContextItems, skills, setSkills };
}

type SetSkills = ReturnType<typeof useAgentEditorState>['setSkills'];

function useSkillActions(setSkills: SetSkills) {
  const handleAddSkills = useCallback(
    (entries: SkillEntry[]) => {
      setSkills((prev) => {
        const existing = new Set(prev.map((s) => s.name));
        const fresh = entries.filter((e) => !existing.has(e.name));
        return [...prev, ...fresh];
      });
    },
    [setSkills]
  );

  const handleDeleteSkill = useCallback(
    (name: string) => {
      setSkills((prev) => prev.filter((s) => s.name !== name));
    },
    [setSkills]
  );

  return { handleAddSkills, handleDeleteSkill };
}

export function AgentEditor({ config, pushOperation, onBackgroundClick, onConfigChange }: AgentEditorProps) {
  const state = useAgentEditorState(config);
  const actions = useAgentEditorActions(state, pushOperation);
  const skillActions = useSkillActions(state.setSkills);

  useEffect(() => {
    onConfigChange?.({
      systemPrompt: state.systemPrompt,
      maxSteps: state.maxSteps,
      contextItems: state.contextItems,
    });
  }, [state.systemPrompt, state.maxSteps, state.contextItems, onConfigChange]);

  return (
    <div className="flex h-full w-full pt-14.5 bg-muted" onClick={onBackgroundClick}>
      <div className="w-full h-full flex animate-in fade-in duration-300 gap-2 px-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-[3] flex-col p-4 bg-popover rounded-md my-2 border">
          <SystemPromptField value={state.systemPrompt} onChange={actions.handleSystemPromptChange} />
        </div>
        <div className="flex min-w-0 flex-[2] flex-col gap-6 overflow-y-auto bg-popover rounded-md p-4 pt-3.5 my-2 border">
          <SkillsList
            skills={state.skills}
            onAdd={skillActions.handleAddSkills}
            onDelete={skillActions.handleDeleteSkill}
          />
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
