'use client';

import { fetchMessagesForExecution, fetchNodeVisitsForExecution } from '@/app/actions/dashboard';
import type { ExecutionMessageRow, ExecutionSummaryRow, NodeVisitRow } from '@/app/lib/dashboard';
import { useCallback, useMemo, useState, useTransition } from 'react';

import type { AgentDebugData, AgentStep } from './agentDebugTypes';
import { groupTurnsAndSteps } from './turnGrouping';

const FIRST_INDEX = 0;

interface AgentDebugStateInput {
  executions: ExecutionSummaryRow[];
  initialNodeVisits: NodeVisitRow[];
  initialMessages: ExecutionMessageRow[];
  initialExecutionId?: string;
}

export interface AgentDebugState {
  selectedExecutionId: string;
  nodeVisits: NodeVisitRow[];
  messages: ExecutionMessageRow[];
  selectedStep: AgentStep | null;
  debugData: AgentDebugData;
  selectedExecution: ExecutionSummaryRow | undefined;
  handleSelectExecution: (executionId: string) => void;
  handleSelectStep: (step: AgentStep) => void;
  handleDeselectStep: () => void;
}

function findExecution(executions: ExecutionSummaryRow[], id: string): ExecutionSummaryRow | undefined {
  return executions.find((e) => e.id === id);
}

function useExecutionFetcher(
  setNodeVisits: (v: NodeVisitRow[]) => void,
  setMessages: (m: ExecutionMessageRow[]) => void,
  setSelectedStep: (s: AgentStep | null) => void,
  setSelectedExecutionId: (id: string) => void
): (executionId: string) => void {
  const [, startTransition] = useTransition();

  return useCallback(
    (executionId: string) => {
      setSelectedExecutionId(executionId);
      setSelectedStep(null);

      startTransition(async () => {
        const [visitsResult, msgsResult] = await Promise.all([
          fetchNodeVisitsForExecution(executionId),
          fetchMessagesForExecution(executionId),
        ]);
        setNodeVisits(visitsResult.rows);
        setMessages(msgsResult.rows);
      });
    },
    [startTransition, setNodeVisits, setMessages, setSelectedStep, setSelectedExecutionId]
  );
}

export function useAgentDebugState(input: AgentDebugStateInput): AgentDebugState {
  const { executions, initialNodeVisits, initialMessages, initialExecutionId } = input;

  const { [FIRST_INDEX]: firstExecution } = executions;
  const [selectedExecutionId, setSelectedExecutionId] = useState(initialExecutionId ?? firstExecution.id);
  const [nodeVisits, setNodeVisits] = useState<NodeVisitRow[]>(initialNodeVisits);
  const [messages, setMessages] = useState<ExecutionMessageRow[]>(initialMessages);
  const [selectedStep, setSelectedStep] = useState<AgentStep | null>(null);

  const handleSelectExecution = useExecutionFetcher(
    setNodeVisits,
    setMessages,
    setSelectedStep,
    setSelectedExecutionId
  );

  const handleSelectStep = useCallback((step: AgentStep) => {
    setSelectedStep(step);
  }, []);

  const handleDeselectStep = useCallback(() => {
    setSelectedStep(null);
  }, []);

  const debugData = useMemo(() => groupTurnsAndSteps(messages, nodeVisits), [messages, nodeVisits]);

  const selectedExecution = useMemo(
    () => findExecution(executions, selectedExecutionId),
    [executions, selectedExecutionId]
  );

  return {
    selectedExecutionId,
    nodeVisits,
    messages,
    selectedStep,
    debugData,
    selectedExecution,
    handleSelectExecution,
    handleSelectStep,
    handleDeselectStep,
  };
}
