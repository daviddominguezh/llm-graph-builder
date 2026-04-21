'use client';

import type { ExecutionMessageRow } from '@/app/lib/dashboard';
import { Bot, User } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AgentStep, AgentTurn } from './agentDebugTypes';
import { extractMessageText } from './agentDebugUtils';
import { StepCard } from './StepCard';
import { ToolCallDisplay } from './ToolCallDisplay';

interface TurnGroupProps {
  turn: AgentTurn;
  selectedStepOrder: number | null;
  onSelectStep: (step: AgentStep) => void;
}

function hasToolCalls(msg: ExecutionMessageRow): boolean {
  return Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
}

function findToolResultMessages(messages: ExecutionMessageRow[], afterIndex: number): ExecutionMessageRow[] {
  const results: ExecutionMessageRow[] = [];
  for (let i = afterIndex + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m !== undefined && m.role === 'tool') {
      results.push(m);
    } else if (m !== undefined && m.role !== 'tool') {
      break;
    }
  }
  return results;
}

function UserMessageBubble({ message }: { message: ExecutionMessageRow }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <User className="size-3 text-primary" />
      </div>
      <div className="rounded-lg bg-muted border-l-2 border-l-primary px-3 py-2 text-xs break-words">
        {extractMessageText(message)}
      </div>
    </div>
  );
}

function AssistantMessageBubble({ message }: { message: ExecutionMessageRow }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
        <Bot className="size-3 text-muted-foreground" />
      </div>
      <div className="rounded-lg border bg-card px-3 py-2 text-xs break-words">{extractMessageText(message)}</div>
    </div>
  );
}

function TurnSteps({ turn, selectedStepOrder, onSelectStep }: TurnGroupProps) {
  if (turn.steps.length === 0) return null;

  return (
    <div className="ml-8 flex flex-col gap-1.5">
      {turn.steps.map((step) => (
        <StepCard
          key={step.stepOrder}
          step={step}
          isSelected={selectedStepOrder === step.stepOrder}
          onSelect={onSelectStep}
        />
      ))}
    </div>
  );
}

function TurnHeader({ turnIndex }: { turnIndex: number }) {
  const t = useTranslations('dashboard.agentDebug');
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] font-medium uppercase text-primary/60">
        {t('turnN', { n: turnIndex + 1 })}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function AssistantMessageWithToolCalls({
  msg,
  index,
  allMessages,
}: {
  msg: ExecutionMessageRow;
  index: number;
  allMessages: ExecutionMessageRow[];
}) {
  return (
    <>
      <AssistantMessageBubble message={msg} />
      {hasToolCalls(msg) && (
        <ToolCallDisplay message={msg} resultMessages={findToolResultMessages(allMessages, index)} />
      )}
    </>
  );
}

export function TurnGroup({ turn, selectedStepOrder, onSelectStep }: TurnGroupProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <TurnHeader turnIndex={turn.turnIndex} />
      {turn.userMessage !== null && <UserMessageBubble message={turn.userMessage} />}
      {turn.assistantMessages.map((msg, idx) => (
        <AssistantMessageWithToolCalls key={msg.id} msg={msg} index={idx} allMessages={turn.assistantMessages} />
      ))}
      <TurnSteps turn={turn} selectedStepOrder={selectedStepOrder} onSelectStep={onSelectStep} />
    </div>
  );
}
