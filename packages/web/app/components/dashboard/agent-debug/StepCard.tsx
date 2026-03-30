'use client';

import { TokenDisplay } from '@/app/components/panels/simulation/TokenDisplay';
import type { NodeVisitRow } from '@/app/lib/dashboard';
import { Brain, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AgentStep } from './agentDebugTypes';

interface StepCardProps {
  step: AgentStep;
  isSelected: boolean;
  onSelect: (step: AgentStep) => void;
}

function visitToTokens(visit: NodeVisitRow) {
  return {
    input: visit.input_tokens,
    output: visit.output_tokens,
    cached: visit.cached_tokens,
    costUSD: visit.cost,
  };
}

function StepHeader({ step }: { step: AgentStep }) {
  const t = useTranslations('dashboard.agentDebug');

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold font-mono">{t('stepN', { n: step.stepOrder })}</span>
      <span className="text-[10px] text-muted-foreground/40">|</span>
      <span className="inline-flex items-center font-mono text-[10px] text-muted-foreground">
        <Brain className="mr-0.5 size-2.5" />
        {step.visit.model}
      </span>
    </div>
  );
}

export function StepCard({ step, isSelected, onSelect }: StepCardProps) {
  const selectedClass = isSelected ? 'ring-1 ring-primary/50 bg-primary/5' : 'hover:bg-muted/50';

  return (
    <button
      type="button"
      onClick={() => onSelect(step)}
      className={`flex w-full items-center justify-between rounded-md border p-2.5 text-left transition-colors ${selectedClass}`}
    >
      <div className="flex flex-col gap-1">
        <StepHeader step={step} />
        <TokenDisplay tokens={visitToTokens(step.visit)} durationMs={step.visit.duration_ms} />
      </div>
      <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
    </button>
  );
}
