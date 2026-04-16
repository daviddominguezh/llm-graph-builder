'use client';

import type { Operation } from '@daviddh/graph-types';

import type { AgentConfigData } from '../hooks/useGraphLoader';
import { AgentEditor } from './agent-editor';

interface AgentEditorWrapperProps {
  agentConfig: AgentConfigData;
  pushOperation: (op: Operation) => void;
  importCounter: number;
  insets?: { top: number; left: number; right: number; bottom: number };
  onBackgroundClick?: () => void;
  onConfigChange?: (config: AgentConfigData) => void;
  agentId?: string;
  orgId?: string;
}

export function AgentEditorWrapper({
  agentConfig,
  pushOperation,
  importCounter,
  onBackgroundClick,
  onConfigChange,
  agentId,
  orgId,
  insets = { top: 0, left: 0, right: 0, bottom: 0 },
}: AgentEditorWrapperProps) {
  return (
    <AgentEditor
      key={importCounter}
      config={agentConfig}
      pushOperation={pushOperation}
      onBackgroundClick={onBackgroundClick}
      onConfigChange={onConfigChange}
      agentId={agentId}
      orgId={orgId}
      insets={insets}
    />
  );
}
