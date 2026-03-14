'use client';

import { GitBranch, PlusCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import type { CopilotActionBlock, CopilotMessage, CopilotTextBlock } from './copilotTypes';

const ACTION_ICONS: Record<string, LucideIcon> = {
  'plus-circle': PlusCircle,
  'git-branch': GitBranch,
};

function ActionBlock({ block }: { block: CopilotActionBlock }) {
  const Icon = ACTION_ICONS[block.icon] ?? PlusCircle;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <span className="text-xs font-bold">{block.title}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{block.description}</p>
    </div>
  );
}

function TextBlock({ block }: { block: CopilotTextBlock }) {
  return <p className="text-xs leading-relaxed">{block.content}</p>;
}

function UserMessage({ message }: { message: CopilotMessage }) {
  const textBlock = message.blocks.find((b): b is CopilotTextBlock => b.type === 'text');

  return (
    <div className="ml-auto border-r-2 border-primary py-0 pr-2">
      <p className="text-right text-xs leading-relaxed">{textBlock?.content ?? ''}</p>
    </div>
  );
}

function AssistantMessage({ message }: { message: CopilotMessage }) {
  return (
    <div className="flex flex-col gap-2">
      {message.blocks.map((block, i) => {
        if (block.type === 'action') return <ActionBlock key={i} block={block} />;
        return <TextBlock key={i} block={block} />;
      })}
    </div>
  );
}

export interface CopilotMessagesProps {
  messages: CopilotMessage[];
}

export function CopilotMessages({ messages }: CopilotMessagesProps) {
  const t = useTranslations('copilot');
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sentinelRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">{t('emptyState')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
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
