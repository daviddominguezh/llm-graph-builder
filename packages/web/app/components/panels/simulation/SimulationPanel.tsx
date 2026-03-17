'use client';

import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import type { NodeResult, SimulationTokens } from '../../../types/simulation';
import { NodeResultItem } from './NodeResultItem';
import { SimulationInput } from './SimulationInput';
import { TokenDisplay } from './TokenDisplay';

interface SimulationPanelProps {
  lastUserText: string;
  nodeResults: NodeResult[];
  visitedNodes: string[];
  terminated: boolean;
  loading: boolean;
  currentNode: string;
  totalTokens: SimulationTokens;
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
        <Button variant="ghost" size="icon" className="size-7" onClick={onStop}>
          <X className="size-3" />
        </Button>
      </div>
      <Breadcrumbs nodes={visitedNodes} />
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  if (text === '') return null;
  return (
    <div className="max-w-[80%] ml-auto bg-accent/10 rounded-md p-2 pr-0">
      <p className="text-xs leading-relaxed border-r-3 border-primary pr-2">{text}</p>
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

function ExecutingIndicator({ currentNode, hasTokens }: { currentNode: string, hasTokens: boolean }) {
  const t = useTranslations('simulation');
  return (
    <div className={`flex items-center gap-1.5 px-3 pt-1.5 text-xs text-muted-foreground ${hasTokens ? '' : 'pb-1.5'}`}>
      <Loader2 className="size-3 animate-spin" />
      <span className="truncate text-[10px]">{t('executingNode', { node: currentNode })}</span>
    </div>
  );
}

function SimulationFooter({ totalTokens, loading, currentNode }: SimulationFooterProps) {
  const t = useTranslations('simulation');
  const hasTokens = totalTokens.input > 0 || totalTokens.output > 0;
  return (
    <div className="flex flex-col border-t">
      {loading && <ExecutingIndicator hasTokens={hasTokens} currentNode={currentNode} />}
      {hasTokens && (
        <div className="flex items-center gap-1.5 px-3 py-1">
          <span className="text-[10px] font-medium text-muted-foreground">{t('totalTokens')}:</span>
          <TokenDisplay tokens={totalTokens} />
        </div>
      )}
    </div>
  );
}

interface SimulationFooterProps {
  totalTokens: SimulationTokens;
  loading: boolean;
  currentNode: string;
}

export function SimulationPanel(props: SimulationPanelProps) {
  const { lastUserText, nodeResults, visitedNodes, terminated, loading } = props;
  const { currentNode, totalTokens, onSendMessage, onStop } = props;
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
    <div className="absolute inset-y-0 left-0 z-10 flex w-[350px] p-0">
      <div className="relative flex h-full w-full flex-col rounded-xl border bg-background">
        <SimulationHeader visitedNodes={visitedNodes} onStop={onStop} />
        <ContentArea lastUserText={lastUserText} nodeResults={nodeResults} scrollRef={scrollRef} />
        <SimulationFooter totalTokens={totalTokens} loading={loading} currentNode={currentNode} />
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
