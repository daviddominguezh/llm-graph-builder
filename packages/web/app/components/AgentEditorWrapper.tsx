'use client';

import type { Operation } from '@daviddh/graph-types';

import { AgentEditor } from './agent-editor';
import type { AgentConfigData } from '../hooks/useGraphLoader';

interface AgentEditorWrapperProps {
  agentConfig: AgentConfigData;
  pushOperation: (op: Operation) => void;
  importCounter: number;
  onBackgroundClick?: () => void;
}

export function AgentEditorWrapper({ agentConfig, pushOperation, importCounter, onBackgroundClick }: AgentEditorWrapperProps) {
  return <AgentEditor key={importCounter} config={agentConfig} pushOperation={pushOperation} onBackgroundClick={onBackgroundClick} />;
}
