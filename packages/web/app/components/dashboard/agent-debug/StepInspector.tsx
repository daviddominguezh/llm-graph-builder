'use client';

import { TokenDisplay } from '@/app/components/panels/simulation/TokenDisplay';
import { MessageCards } from '@/app/components/dashboard/node-inspector/MessageCards';
import { ResponseSection } from '@/app/components/dashboard/node-inspector/ResponseSection';
import { Brain } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AgentStep } from './agentDebugTypes';

interface StepInspectorProps {
  step: AgentStep | null;
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-xs text-muted-foreground bg-card p-3 rounded-md border border-secondary/10">{message}</p>
  );
}

function stepToTokens(step: AgentStep) {
  return {
    input: step.visit.input_tokens,
    output: step.visit.output_tokens,
    cached: step.visit.cached_tokens,
    costUSD: step.visit.cost,
  };
}

function StepHeader({ step }: { step: AgentStep }) {
  const t = useTranslations('dashboard.agentDebug');

  return (
    <div>
      <span className="text-sm font-semibold font-mono">{t('stepN', { n: step.stepOrder })}</span>
      <div className="mt-1 flex items-center gap-2">
        <TokenDisplay tokens={stepToTokens(step)} durationMs={step.visit.duration_ms} />
        <span className="text-[10px] text-muted-foreground/40">|</span>
        <span className="inline-flex items-center font-mono text-[10px] text-muted-foreground">
          <Brain className="mr-0.5 size-2.5" />
          {step.visit.model}
        </span>
      </div>
    </div>
  );
}

export function StepInspector({ step }: StepInspectorProps) {
  const t = useTranslations('dashboard.agentDebug');

  if (step === null) {
    return <EmptyState message={t('selectStep')} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <StepHeader step={step} />
      <MessageCards data={step.visit.messages_sent} />
      <ResponseSection visit={step.visit} />
    </div>
  );
}
