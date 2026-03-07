'use client';

import { useRef, useEffect } from 'react';
import { Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { SimulationStep, SimulationTokens } from '../../../types/simulation';
import { TokenDisplay } from './TokenDisplay';
import { StepItem } from './StepItem';
import { SimulationInput } from './SimulationInput';

interface SimulationPanelProps {
  steps: SimulationStep[];
  totalTokens: SimulationTokens;
  currentNode: string;
  loading: boolean;
  onSendMessage: (text: string) => void;
  onStop: () => void;
}

function SimulationHeader({ currentNode, totalTokens, onStop }: Pick<SimulationPanelProps, 'currentNode' | 'totalTokens' | 'onStop'>) {
  return (
    <div className="flex items-center gap-3 border-b px-3 py-2">
      <span className="text-sm font-semibold">Simulation</span>
      <Badge variant="secondary">{currentNode}</Badge>
      <TokenDisplay tokens={totalTokens} className="ml-auto" />
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

export function SimulationPanel({ steps, totalTokens, currentNode, loading, onSendMessage, onStop }: SimulationPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps.length]);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10 flex h-72 flex-col border-t bg-background">
      <SimulationHeader currentNode={currentNode} totalTokens={totalTokens} onStop={onStop} />
      <StepsList steps={steps} scrollRef={scrollRef} />
      <SimulationInput loading={loading} onSendMessage={onSendMessage} />
    </div>
  );
}
