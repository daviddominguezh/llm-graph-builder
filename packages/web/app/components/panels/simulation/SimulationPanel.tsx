'use client';

import { Button } from '@/components/ui/button';
import { Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import type { NodeResult } from '../../../types/simulation';
import { NodeResultItem } from './NodeResultItem';
import { SimulationInput } from './SimulationInput';

interface SimulationPanelProps {
  lastUserText: string;
  nodeResults: NodeResult[];
  visitedNodes: string[];
  terminated: boolean;
  loading: boolean;
  onSendMessage: (text: string) => void;
  onStop: () => void;
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

function SimulationHeader({
  visitedNodes,
  onStop,
}: Pick<SimulationPanelProps, 'visitedNodes' | 'onStop'>) {
  return (
    <div className="flex items-center gap-3 border-b px-3 py-2">
      <span className="shrink-0 text-sm font-semibold">Simulation</span>
      <Breadcrumbs nodes={visitedNodes} />
      <Button variant="destructive" size="sm" className="ml-auto" onClick={onStop}>
        <Square className="mr-1 size-3" />
        Stop
      </Button>
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  if (text === '') return null;
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground">
        {text}
      </div>
    </div>
  );
}

interface ContentAreaProps {
  lastUserText: string;
  nodeResults: NodeResult[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

function ContentArea({ lastUserText, nodeResults, scrollRef }: ContentAreaProps) {
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
      <div className="flex flex-col gap-2">
        <UserMessage text={lastUserText} />
        {nodeResults.map((result, i) => (
          <NodeResultItem key={i} result={result} />
        ))}
      </div>
    </div>
  );
}

export function SimulationPanel(props: SimulationPanelProps) {
  const { lastUserText, nodeResults, visitedNodes, terminated, loading, onSendMessage, onStop } = props;
  const t = useTranslations('simulation');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [nodeResults.length]);

  return (
    <div className="absolute bottom-0 left-0 z-10 flex w-72 h-full p-2 pt-13">
      <div className="relative w-full h-full flex flex-col border bg-background rounded-md shadow-md">
        <SimulationHeader visitedNodes={visitedNodes} onStop={onStop} />
        <ContentArea lastUserText={lastUserText} nodeResults={nodeResults} scrollRef={scrollRef} />
        <SimulationInput
          loading={loading}
          terminated={terminated}
          terminatedLabel={t('terminated')}
          onSendMessage={onSendMessage}
        />
      </div>
    </div>
  );
}
