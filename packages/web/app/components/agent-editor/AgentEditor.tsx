'use client';

import { GlassPanel } from '@/components/ui/glass-panel';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Operation } from '@daviddh/graph-types';
import type { ReactNode } from 'react';
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
  rightSlot?: ReactNode;
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

type AgentEditorState = ReturnType<typeof useAgentEditorState>;
type AgentEditorActions = ReturnType<typeof useAgentEditorActions>;
type SkillActions = ReturnType<typeof useSkillActions>;

function EditorPanel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <GlassPanel
      className={`flex h-[calc(100%-var(--spacing)*2.5)] shrink-0 flex-col p-4 mt-2 mb-2.5 rounded-xl ${className ?? ''}`}
    >
      {children}
    </GlassPanel>
  );
}

function PromptPanel({ state, actions }: { state: AgentEditorState; actions: AgentEditorActions }) {
  return (
    <EditorPanel className="min-w-0 flex-1 basis-0">
      <div className="flex min-h-0 flex-1 flex-col w-full">
        <SystemPromptField value={state.systemPrompt} onChange={actions.handleSystemPromptChange} />
      </div>
    </EditorPanel>
  );
}

interface CapabilitiesPanelProps {
  state: AgentEditorState;
  actions: AgentEditorActions;
  skillActions: SkillActions;
  agentId?: string;
  orgId?: string;
}

function CapabilitiesPanel({ state, actions, skillActions, agentId, orgId }: CapabilitiesPanelProps) {
  return (
    <EditorPanel className="min-w-0 flex-1 basis-0">
      <ScrollArea className="min-h-0 flex-1 w-full">
        <div className="flex flex-col gap-6">
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
      </ScrollArea>
    </EditorPanel>
  );
}

function useConfigChangeEffect(state: AgentEditorState, onConfigChange?: (config: AgentConfigData) => void) {
  useEffect(() => {
    onConfigChange?.({
      systemPrompt: state.systemPrompt,
      maxSteps: state.maxSteps,
      contextItems: state.contextItems,
      skills: state.skills.map((s, i) => ({ ...s, sortOrder: i })),
    });
  }, [state.systemPrompt, state.maxSteps, state.contextItems, state.skills, onConfigChange]);
}

export function AgentEditor({
  config,
  pushOperation,
  onBackgroundClick,
  onConfigChange,
  agentId,
  orgId,
  insets,
  rightSlot,
}: AgentEditorProps) {
  const state = useAgentEditorState(config);
  const actions = useAgentEditorActions(state, pushOperation);
  const skillActions = useSkillActions(state.setSkills, pushOperation);
  useConfigChangeEffect(state, onConfigChange);

  return (
    <div className="absolute" style={insets} onClick={onBackgroundClick}>
      <div className="flex h-full w-full bg-background px-2 pb-1.5">
        <div
          className="w-full h-full flex animate-in fade-in duration-300 gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <PromptPanel state={state} actions={actions} />
          <CapabilitiesPanel
            state={state}
            actions={actions}
            skillActions={skillActions}
            agentId={agentId}
            orgId={orgId}
          />
          {rightSlot !== undefined && (
            <div className="w-[360px] shrink-0 h-[calc(100%-var(--spacing)*2.5)] mt-2 mb-2.5">{rightSlot}</div>
          )}
        </div>
      </div>
    </div>
  );
}
