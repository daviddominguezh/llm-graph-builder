'use client';

import { GlassPanel } from '@/components/ui/glass-panel';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Operation } from '@daviddh/graph-types';
import { FileText, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
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

type AgentEditorState = ReturnType<typeof useAgentEditorState>;
type AgentEditorActions = ReturnType<typeof useAgentEditorActions>;
type SkillActions = ReturnType<typeof useSkillActions>;

type TabId = 'prompt' | 'capabilities';

const TAB_ICONS: Record<TabId, LucideIcon> = {
  prompt: FileText,
  capabilities: Sparkles,
};

const TAB_BASE =
  'cursor-pointer inline-flex h-fit items-center gap-1.5 rounded px-2.5 py-0.5 text-xs font-medium transition-colors border border-transparent';
const TAB_ACTIVE = 'bg-popover dark:bg-input text-foreground shadow-sm';
const TAB_INACTIVE =
  'text-muted-foreground hover:text-foreground border-transparent hover:bg-input dark:hover:bg-card';

interface TabButtonProps {
  tab: TabId;
  active: boolean;
  onClick: (tab: TabId) => void;
  label: string;
}

function TabButton({ tab, active, onClick, label }: TabButtonProps) {
  const Icon = TAB_ICONS[tab];
  return (
    <button
      type="button"
      onClick={() => onClick(tab)}
      className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_INACTIVE}`}
    >
      <Icon strokeWidth={2.5} className="size-3.5" />
      {label}
    </button>
  );
}

function TabBar({ activeTab, onTabChange }: { activeTab: TabId; onTabChange: (tab: TabId) => void }) {
  const t = useTranslations('agentEditor');
  return (
    <div className="inline-flex gap-1 h-fit dark:gap-0.5 rounded-sm border border-[0.5px] border-transparent bg-input dark:bg-input/40 dark:bg-muted/50 p-0.5 self-start mb-3">
      <TabButton tab="prompt" active={activeTab === 'prompt'} onClick={onTabChange} label={t('promptTab')} />
      <TabButton
        tab="capabilities"
        active={activeTab === 'capabilities'}
        onClick={onTabChange}
        label={t('capabilitiesTab')}
      />
    </div>
  );
}

interface CapabilitiesTabProps {
  state: AgentEditorState;
  actions: AgentEditorActions;
  skillActions: SkillActions;
  agentId?: string;
  orgId?: string;
}

function CapabilitiesTab({ state, actions, skillActions, agentId, orgId }: CapabilitiesTabProps) {
  return (
    <ScrollArea className="h-full w-full">
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
}: AgentEditorProps) {
  const [activeTab, setActiveTab] = useState<TabId>('prompt');
  const state = useAgentEditorState(config);
  const actions = useAgentEditorActions(state, pushOperation);
  const skillActions = useSkillActions(state.setSkills, pushOperation);
  useConfigChangeEffect(state, onConfigChange);

  return (
    <div className="absolute" style={insets} onClick={onBackgroundClick}>
      <div className="flex h-full w-full bg-background px-2 pb-1.5">
        <div className="w-full h-full flex animate-in fade-in duration-300" onClick={(e) => e.stopPropagation()}>
          <GlassPanel className="flex min-w-0 flex-1 h-[calc(100%-var(--spacing)*2.5)] shrink-0 flex-col p-4 mt-2 mb-2.5 rounded-xl shadow-none">
            <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
            <div className={activeTab === 'prompt' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
              <SystemPromptField value={state.systemPrompt} onChange={actions.handleSystemPromptChange} />
            </div>
            <div className={activeTab === 'capabilities' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
              <CapabilitiesTab
                state={state}
                actions={actions}
                skillActions={skillActions}
                agentId={agentId}
                orgId={orgId}
              />
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
