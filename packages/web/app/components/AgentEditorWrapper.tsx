'use client';

import type { Operation } from '@daviddh/graph-types';

import { AgentEditor } from './agent-editor';
import type { OrgInfo } from './agent-editor/VfsConfigTable';
import type { AgentConfigData } from '../hooks/useGraphLoader';

interface AgentEditorWrapperProps {
  agentConfig: AgentConfigData;
  pushOperation: (op: Operation) => void;
  importCounter: number;
  onBackgroundClick?: () => void;
  onConfigChange?: (config: AgentConfigData) => void;
  agentId?: string;
  organizations?: OrgInfo[];
}

export function AgentEditorWrapper({
  agentConfig,
  pushOperation,
  importCounter,
  onBackgroundClick,
  onConfigChange,
  agentId,
  organizations,
}: AgentEditorWrapperProps) {
  return (
    <AgentEditor
      key={importCounter}
      config={agentConfig}
      pushOperation={pushOperation}
      onBackgroundClick={onBackgroundClick}
      onConfigChange={onConfigChange}
      agentId={agentId}
      organizations={organizations}
    />
  );
}
