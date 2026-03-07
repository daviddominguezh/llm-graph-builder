'use client';

import { Separator } from '@/components/ui/separator';
import type { SimulationStep } from '../../../types/simulation';
import { TokenDisplay } from './TokenDisplay';

interface StepItemProps {
  step: SimulationStep;
  index: number;
}

function VisitedNodesPath({ nodes }: { nodes: string[] }) {
  return (
    <p className="mb-1 text-xs font-medium text-muted-foreground">{nodes.join(' \u2192 ')}</p>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">
        {text}
      </div>
    </div>
  );
}

function AgentMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-lg bg-muted px-3 py-1.5 text-sm">{text}</div>
    </div>
  );
}

export function StepItem({ step, index }: StepItemProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {index > 0 && <Separator className="my-1" />}
      <VisitedNodesPath nodes={step.visitedNodes} />
      <UserMessage text={step.userText} />
      <AgentMessage text={step.agentText} />
      <TokenDisplay
        tokens={{ input: step.tokenUsage.input, output: step.tokenUsage.output, cached: step.tokenUsage.cached }}
        className="self-end"
      />
    </div>
  );
}
