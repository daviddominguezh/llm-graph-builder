'use client';

import { useTranslations } from 'next-intl';

import type { AgentDebugData, AgentStep } from './agentDebugTypes';
import { TurnGroup } from './TurnGroup';

interface AgentChatTimelineProps {
  debugData: AgentDebugData;
  selectedStepOrder: number | null;
  onSelectStep: (step: AgentStep) => void;
}

function EmptyTimeline({ message }: { message: string }) {
  return (
    <p className="text-xs text-muted-foreground bg-card p-3 rounded-md border border-secondary/10">{message}</p>
  );
}

export function AgentChatTimeline({ debugData, selectedStepOrder, onSelectStep }: AgentChatTimelineProps) {
  const t = useTranslations('dashboard.agentDebug');

  if (debugData.turns.length === 0) {
    return <EmptyTimeline message={t('noMessages')} />;
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto">
      {debugData.turns.map((turn) => (
        <TurnGroup
          key={turn.turnIndex}
          turn={turn}
          selectedStepOrder={selectedStepOrder}
          onSelectStep={onSelectStep}
        />
      ))}
    </div>
  );
}
