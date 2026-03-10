'use client';

import { useRef, useEffect } from 'react';
import { Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { SimulationStep, SimulationTokens } from '../../../types/simulation';
import { TokenDisplay } from './TokenDisplay';
import { StepItem } from './StepItem';
import { SimulationInput } from './SimulationInput';

interface SimulationPanelProps {
  steps: SimulationStep[];
  totalTokens: SimulationTokens;
  terminated: boolean;
  loading: boolean;
  onSendMessage: (text: string) => void;
  onStop: () => void;
}

function buildBreadcrumbs(steps: SimulationStep[]): string[] {
  return steps.flatMap((s) => s.visitedNodes);
}

function Breadcrumbs({ nodes }: { nodes: string[] }) {
  if (nodes.length === 0) return null;
  const lastIndex = nodes.length - 1;
  return (
    <p className="truncate text-xs text-muted-foreground">
      {nodes.map((node, i) => (
        <span key={i}>
          {i > 0 && ' \u2192 '}
          <span className={i === lastIndex ? 'font-bold text-foreground' : ''}>{node}</span>
        </span>
      ))}
    </p>
  );
}

function SimulationHeader({ steps, totalTokens, onStop }: Pick<SimulationPanelProps, 'steps' | 'totalTokens' | 'onStop'>) {
  const breadcrumbs = buildBreadcrumbs(steps);
  return (
    <div className="flex items-center gap-3 border-b px-3 py-2">
      <span className="shrink-0 text-sm font-semibold">Simulation</span>
      <Breadcrumbs nodes={breadcrumbs} />
      <TokenDisplay tokens={totalTokens} className="ml-auto shrink-0" />
      <Button variant="destructive" size="sm" onClick={onStop}>
        <Square className="mr-1 size-3" />
        Stop
      </Button>
    </div>
  );
}

function StepsList({ steps, scrollRef }: { steps: SimulationStep[]; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
      <div className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <StepItem key={i} step={step} index={i} />
        ))}
      </div>
    </div>
  );
}

export function SimulationPanel({ steps, totalTokens, terminated, loading, onSendMessage, onStop }: SimulationPanelProps) {
  const t = useTranslations('simulation');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps.length]);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 flex h-72 flex-col border-t bg-background">
      <SimulationHeader steps={steps} totalTokens={totalTokens} onStop={onStop} />
      <StepsList steps={steps} scrollRef={scrollRef} />
      <SimulationInput loading={loading} terminated={terminated} terminatedLabel={t('terminated')} onSendMessage={onSendMessage} />
    </div>
  );
}
