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
    <p className="truncate font-mono text-[10px] text-muted-foreground">
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
    <div className="flex flex-col gap-1 border-b px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Simulation</span>
        <Button variant="destructive" size="icon" className="size-7" onClick={onStop}>
          <Square className="size-3" />
        </Button>
      </div>
      <Breadcrumbs nodes={visitedNodes} />
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  if (text === '') return null;
  return (
    <div className="ml-auto border-r-3 border-primary py-0 pr-2">
      <p className="text-right text-xs leading-relaxed">{text}</p>
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
      <div className="flex flex-col gap-4">
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStop();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStop]);

  return (
    <div className="absolute inset-y-0 left-0 z-10 flex w-[350px] p-2 pt-3">
      <div className="relative flex h-full w-full flex-col rounded-md border bg-background shadow-md">
        <SimulationHeader visitedNodes={visitedNodes} onStop={onStop} />
        <ContentArea lastUserText={lastUserText} nodeResults={nodeResults} scrollRef={scrollRef} />
        <SimulationInput
          loading={loading}
          terminated={terminated}
          terminatedLabel={t('terminated')}
          terminatedDescription={t('terminatedDescription')}
          onSendMessage={onSendMessage}
        />
      </div>
    </div>
  );
}
