'use client';

import type { ExecutionMessageRow, ExecutionSummaryRow, NodeVisitRow, SessionRow } from '@/app/lib/dashboard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useTranslations } from 'next-intl';

import { AgentChatTimeline } from './agent-debug/AgentChatTimeline';
import { StepInspector } from './agent-debug/StepInspector';
import type { AgentDebugState } from './agent-debug/useAgentDebugState';
import { useAgentDebugState } from './agent-debug/useAgentDebugState';
import { DebugBreadcrumb } from './debug-view/DebugBreadcrumb';
import { ExecutionErrorBanner } from './debug-view/ExecutionErrorBanner';
import { SessionMetadataBar } from './debug-view/SessionMetadataBar';

export interface AgentDebugViewProps {
  session: SessionRow;
  executions: ExecutionSummaryRow[];
  initialNodeVisits: NodeVisitRow[];
  initialMessages: ExecutionMessageRow[];
  orgSlug: string;
  agentName: string;
  breadcrumbLabel: string;
  breadcrumbSlug: string;
}

interface ExecutionSelectorProps {
  executions: ExecutionSummaryRow[];
  selectedExecutionId: string;
  onSelectExecution: (executionId: string) => void;
}

function ExecutionSelector({ executions, selectedExecutionId, onSelectExecution }: ExecutionSelectorProps) {
  const t = useTranslations('dashboard.debug');

  if (executions.length <= 1) return null;

  return (
    <div className="px-4 py-2">
      <Select
        value={selectedExecutionId}
        onValueChange={(val) => {
          if (val !== null) onSelectExecution(val);
        }}
      >
        <SelectTrigger className="w-[220px] h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {executions.map((exec, idx) => (
            <SelectItem key={exec.id} value={exec.id} className="text-xs">
              {t('executionN', { n: idx + 1 })} - {exec.status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function AgentDebugHeader(props: {
  orgSlug: string;
  agentName: string;
  agentSlug: string;
  sessionId: string;
  dashboardLabel: string;
}) {
  return (
    <>
      <div className="px-4 py-3 shrink-0 bg-background">
        <DebugBreadcrumb
          slug={props.orgSlug}
          agentName={props.agentName}
          agentSlug={props.agentSlug}
          sessionId={props.sessionId}
          dashboardLabel={props.dashboardLabel}
        />
      </div>
      <Separator />
    </>
  );
}

function AgentDebugContent({ state }: { state: AgentDebugState }) {
  return (
    <div className="px-4 pt-4 flex flex-1 gap-4 min-h-0">
      <div className="w-1/2 overflow-y-auto">
        <AgentChatTimeline
          debugData={state.debugData}
          selectedStepOrder={state.selectedStep?.stepOrder ?? null}
          onSelectStep={state.handleSelectStep}
        />
      </div>
      <div className="w-1/2 overflow-y-auto">
        <StepInspector step={state.selectedStep} />
      </div>
    </div>
  );
}

function AgentDebugPanels(props: AgentDebugViewProps) {
  const t = useTranslations('dashboard');

  const state = useAgentDebugState({
    executions: props.executions,
    initialNodeVisits: props.initialNodeVisits,
    initialMessages: props.initialMessages,
  });

  return (
    <div className="px-0 pb-3 flex flex-col gap-0 flex-1 min-h-[0px]">
      <SessionMetadataBar session={props.session} agentName={props.agentName} />
      <Separator />
      <ExecutionSelector
        executions={props.executions}
        selectedExecutionId={state.selectedExecutionId}
        onSelectExecution={state.handleSelectExecution}
      />
      {state.selectedExecution !== undefined && (
        <div className="px-4">
          <ExecutionErrorBanner execution={state.selectedExecution} label={t('debug.executionError')} />
        </div>
      )}
      <AgentDebugContent state={state} />
    </div>
  );
}

export function AgentDebugView(props: AgentDebugViewProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="flex h-full flex-col bg-background">
      <AgentDebugHeader
        orgSlug={props.orgSlug}
        agentName={props.breadcrumbLabel}
        agentSlug={props.breadcrumbSlug}
        sessionId={props.session.session_id}
        dashboardLabel={t('title')}
      />
      <AgentDebugPanels {...props} />
    </div>
  );
}
