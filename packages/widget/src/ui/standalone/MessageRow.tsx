import { GitBranch, PlusCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { MarkdownText } from '../MarkdownText.js';
import { MessageActions } from '../MessageActions.js';
import { ThinkingBlock } from '../ThinkingBlock.js';
import type { CopilotActionBlock, CopilotMessage, CopilotTextBlock } from '../copilotTypes.js';

const STREAMING_ID = 'streaming';

const ACTION_ICONS: Record<string, LucideIcon> = {
  'plus-circle': PlusCircle,
  'git-branch': GitBranch,
};

function ActionBlock({ block }: { block: CopilotActionBlock }) {
  const Icon = ACTION_ICONS[block.icon] ?? PlusCircle;

  return (
    <div className="rounded-lg bg-input dark:bg-background p-3 my-1.5 mx-2 text-muted-foreground">
      <div className="flex items-center gap-2">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{block.title}</span>
      </div>
      {block.description !== '' && <p className="mt-1 text-xs">{block.description}</p>}
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
    <div className="flex justify-end">
      <div className="max-w-[70%] bg-background dark:bg-input/40 text-foreground rounded-lg px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap">
        {textBlock?.content ?? ''}
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: CopilotMessage }) {
  const showActions = message.id !== STREAMING_ID && message.blocks.some((b) => b.type === 'text');
  const actionText = showActions ? collectAssistantText(message) : '';
  return (
    <div className="flex flex-col gap-1 text-foreground max-w-[90%]">
      {message.blocks.map((block, i) => {
        if (block.type === 'action') return <ActionBlock key={i} block={block} />;
        if (block.type === 'thinking') return <ThinkingBlock key={i} />;
        return <TextBlock key={i} block={block} />;
      })}
      {showActions && <MessageActions text={actionText} />}
    </div>
  );
}

export function MessageRow({ message }: { message: CopilotMessage }) {
  if (message.role === 'user') return <UserMessage message={message} />;
  return <AssistantMessage message={message} />;
}
