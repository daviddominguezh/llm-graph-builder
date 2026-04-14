'use client';

import type { ExecutionMessageRow, ExecutionSummaryRow, NodeVisitRow, SessionRow } from '@/app/lib/dashboard';
import { Separator } from '@/components/ui/separator';
import { useTranslations } from 'next-intl';

import { AgentChatTimeline } from './agent-debug/AgentChatTimeline';
import { StepInspector } from './agent-debug/StepInspector';
import type { AgentDebugState } from './agent-debug/useAgentDebugState';
import { useAgentDebugState } from './agent-debug/useAgentDebugState';
import { DebugBreadcrumb } from './debug-view/DebugBreadcrumb';
import { ExecutionErrorBanner } from './debug-view/ExecutionErrorBanner';
import { ExecutionSidebar } from './debug-view/ExecutionSidebar';
import { SessionMetadataBar } from './debug-view/SessionMetadataBar';

export interface AgentDebugViewProps {
  session: SessionRow;
  executions: ExecutionSummaryRow[];
  initialNodeVisits: NodeVisitRow[];
  initialMessages: ExecutionMessageRow[];
  initialExecutionId?: string;
  orgSlug: string;
  agentName: string;
  breadcrumbLabel: string;
  breadcrumbSlug: string;
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
    <div className="px-4 pt-4 flex flex-1 gap-0 min-h-0">
      <div className="w-1/2 overflow-y-auto pr-4">
        <AgentChatTimeline
          debugData={state.debugData}
          selectedStepOrder={state.selectedStep?.stepOrder ?? null}
          onSelectStep={state.handleSelectStep}
        />
      </div>
      <div className="w-1/2 overflow-y-auto border-l pl-4">
        <StepInspector step={state.selectedStep} />
      </div>
    </div>
  );
}

function TotalStepsBadge({ count, label }: { count: number; label: string }) {
  if (count === 0) return null;
  return (
    <div className="px-4 py-1 text-[10px] text-muted-foreground">
      {count} {label}
    </div>
  );
}

function AgentDebugPanelsInner(props: AgentDebugViewProps & { state: AgentDebugState }) {
  const t = useTranslations('dashboard');
  const { state } = props;

  return (
    <div className="px-0 pb-3 flex flex-col gap-0 flex-1 min-h-[0px]">
      <SessionMetadataBar session={props.session} agentName={props.agentName} tenantName={props.breadcrumbLabel} />
      <TotalStepsBadge count={state.debugData.totalSteps} label={t('agentDebug.totalSteps')} />
      <Separator />
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
  const state = useAgentDebugState({
    executions: props.executions,
    initialNodeVisits: props.initialNodeVisits,
    initialMessages: props.initialMessages,
    initialExecutionId: props.initialExecutionId,
  });

  return (
    <div className="flex h-full flex-col bg-background overflow-hidden border border mr-1.5 rounded-xl">
      <AgentDebugHeader
        orgSlug={props.orgSlug}
        agentName={props.breadcrumbLabel}
        agentSlug={props.breadcrumbSlug}
        sessionId={props.session.session_id}
        dashboardLabel={t('title')}
      />
      <div className="flex flex-1 min-h-0">
        <ExecutionSidebar
          executions={props.executions}
          selectedId={state.selectedExecutionId}
          onSelect={state.handleSelectExecution}
        />
        <div className="flex-1 min-w-0 flex flex-col">
          <AgentDebugPanelsInner {...props} state={state} />
        </div>
      </div>
    </div>
  );
}
