'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { GlassPanel } from '@/components/ui/glass-panel';
import { Loader2, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ConversationEntry, NodeResult, SimulationTokens } from '../../../types/simulation';
import { NodeResultItem } from './NodeResultItem';
import { SimulationInput } from './SimulationInput';
import { TokenDisplay } from './TokenDisplay';

interface SimulationPanelProps {
  lastUserText: string;
  nodeResults: NodeResult[];
  conversationEntries: ConversationEntry[];
  visitedNodes: string[];
  terminated: boolean;
  loading: boolean;
  currentNode: string;
  totalTokens: SimulationTokens;
  turnCount: number;
  isAgent: boolean;
  modelId: string;
  onModelIdChange: (id: string) => void;
  onSendMessage: (text: string) => void;
  onStop: () => void;
  onClear: () => void;
}

function Breadcrumbs({ nodes }: { nodes: string[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el !== null) {
      el.scrollLeft = el.scrollWidth;
    }
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [nodes.length, scrollToEnd]);

  if (nodes.length === 0) return null;
  const lastIndex = nodes.length - 1;
  return (
    <div ref={scrollRef} className="overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <p className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
        {nodes.map((node, i) => (
          <span key={i}>
            {i > 0 && ' \u2192 '}
            <span className={i === lastIndex ? 'font-bold text-foreground' : ''}>{node}</span>
          </span>
        ))}
      </p>
    </div>
  );
}

/* Composition breadcrumb removed — the child_start/child_end separators in the conversation
   stream are sufficient to indicate nesting. */

function SimulationHeader({
  visitedNodes,
  onStop,
  onClear,
}: Pick<SimulationPanelProps, 'visitedNodes' | 'onStop' | 'onClear'>) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const t = useTranslations('simulation');

  return (
    <div className="flex flex-col gap-1 border-b px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t('title')}</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-3" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={onStop}>
            <X className="size-3" />
          </Button>
        </div>
      </div>
      <Breadcrumbs nodes={visitedNodes} />
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('clearTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('clearDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('clearCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onClear}>{t('clearConfirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  conversationEntries: ConversationEntry[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

function ContentArea({ conversationEntries, scrollRef }: ContentAreaProps) {
  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
      <div className="flex flex-col gap-4">
        {conversationEntries.map((entry, i) => {
          if (entry.type === 'user') return <UserMessage key={i} text={entry.text} />;
          if (entry.type === 'result') return <NodeResultItem key={i} result={entry.result} />;
          if (entry.type === 'child_start') {
            return (
              <div key={i} className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  {entry.label} started
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            );
          }
          if (entry.type === 'child_end') {
            return (
              <div key={i} className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  child finished ({entry.label})
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ExecutingIndicator({ currentNode }: { currentNode: string }) {
  const t = useTranslations('simulation');
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="size-3 animate-spin" />
      <span className="truncate text-[10px]">{t('executingNode', { node: currentNode })}</span>
    </div>
  );
}

function SimulationFooter({ totalTokens, turnCount, isAgent, loading, currentNode }: SimulationFooterProps) {
  const t = useTranslations('simulation');
  const hasTokens = totalTokens.input > 0 || totalTokens.output > 0;
  const showTurn = isAgent && turnCount > 0;
  const showFooter = loading || hasTokens || showTurn;
  if (!showFooter) return null;
  return (
    <div className="flex flex-col gap-0.5 border-t border-b px-3 py-1.5">
      {loading && <ExecutingIndicator currentNode={currentNode} />}
      <div className="flex items-center gap-3">
        {showTurn && (
          <span className="text-[10px] font-medium text-muted-foreground">
            {t('turn')} {String(turnCount)}
          </span>
        )}
        {hasTokens && <TokenDisplay tokens={totalTokens} />}
      </div>
    </div>
  );
}

interface SimulationFooterProps {
  totalTokens: SimulationTokens;
  turnCount: number;
  isAgent: boolean;
  loading: boolean;
  currentNode: string;
}

export function SimulationPanel(props: SimulationPanelProps) {
  const { visitedNodes, terminated, loading } = props;
  const { currentNode, totalTokens, modelId, onModelIdChange, onSendMessage, onStop } = props;
  const t = useTranslations('simulation');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [props.conversationEntries.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onStop();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStop]);

  return (
    <div className="absolute inset-y-0 top-[calc(41px+var(--spacing)*1.5)] bottom-1.5 left-[calc(240px+var(--spacing)*1.5)] z-10 flex w-[350px] p-0">
      <GlassPanel variant="background" className="w-full h-full rounded-xl">
        <div className="relative flex h-full w-full flex-col">
          <SimulationHeader visitedNodes={visitedNodes} onStop={onStop} onClear={props.onClear} />
          <ContentArea conversationEntries={props.conversationEntries} scrollRef={scrollRef} />
          <SimulationFooter
            totalTokens={totalTokens}
            turnCount={props.turnCount}
            isAgent={props.isAgent}
            loading={loading}
            currentNode={currentNode}
          />
          <SimulationInput
            loading={loading}
            terminated={terminated}
            terminatedLabel={t('terminated')}
            terminatedDescription={t('terminatedDescription')}
            modelId={modelId}
            onModelIdChange={onModelIdChange}
            onSendMessage={onSendMessage}
          />
        </div>
      </GlassPanel>
    </div>
  );
}
