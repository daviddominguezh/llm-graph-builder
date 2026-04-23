import { GitBranch, PlusCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRef } from 'react';

import { useT } from '../app/i18nContext.js';
import type { CopilotActionBlock, CopilotMessage, CopilotTextBlock } from './copilotTypes.js';
import { MarkdownText } from './MarkdownText.js';
import { MessageActions } from './MessageActions.js';
import { ThinkingBlock } from './ThinkingBlock.js';
import { useAutoScroll } from './useAutoScroll.js';

const STREAMING_ID = 'streaming';

const ACTION_ICONS: Record<string, LucideIcon> = {
  'plus-circle': PlusCircle,
  'git-branch': GitBranch,
};

function ActionBlock({ block }: { block: CopilotActionBlock }) {
  const Icon = ACTION_ICONS[block.icon] ?? PlusCircle;

  return (
    <div className="rounded-lg bg-input dark:bg-background p-3 text-muted-foreground">
      <div className="flex items-center gap-2">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{block.title}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{block.description}</p>
    </div>
  );
}

function TextBlock({ block }: { block: CopilotTextBlock }) {
  return <MarkdownText text={block.content} />;
}

function collectAssistantText(message: CopilotMessage): string {
  return message.blocks
    .filter((b): b is CopilotTextBlock => b.type === 'text')
    .map((b) => b.content)
    .join('\n\n');
}

function UserMessage({ message }: { message: CopilotMessage }) {
  const textBlock = message.blocks.find((b): b is CopilotTextBlock => b.type === 'text');

  return (
    <div className="ml-auto border-r-2 border-primary py-0 pr-2 max-w-[90%]">
      <p className="text-right text-xs leading-relaxed">{textBlock?.content ?? ''}</p>
    </div>
  );
}

function AssistantMessage({ message }: { message: CopilotMessage }) {
  const showActions = message.id !== STREAMING_ID && message.blocks.some((b) => b.type === 'text');
  const actionText = showActions ? collectAssistantText(message) : '';
  return (
    <div className="flex flex-col gap-2 max-w-[90%]">
      {message.blocks.map((block, i) => {
        if (block.type === 'action') return <ActionBlock key={i} block={block} />;
        if (block.type === 'thinking') return <ThinkingBlock key={i} />;
        return <TextBlock key={i} block={block} />;
      })}
      {showActions && <MessageActions text={actionText} />}
    </div>
  );
}

function EmptyState({ greeting, label }: { greeting: string; label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center justify-center p-3">
        <p className="font-semibold font-mono">{greeting}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export interface CopilotMessagesProps {
  messages: CopilotMessage[];
}

export function CopilotMessages({ messages }: CopilotMessagesProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useAutoScroll(messages, containerRef);

  if (messages.length === 0) {
    return <EmptyState greeting={t('greeting')} label={t('emptyState')} />;
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-3 py-2">
      <div className="flex flex-col gap-4">
        {messages.map((message) =>
          message.role === 'user' ? (
            <UserMessage key={message.id} message={message} />
          ) : (
            <AssistantMessage key={message.id} message={message} />
          )
        )}
        <div ref={sentinelRef} />
      </div>
    </div>
  );
}
