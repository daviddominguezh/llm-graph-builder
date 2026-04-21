import { GitBranch, PlusCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { CopilotActionBlock, CopilotMessage, CopilotTextBlock } from '../copilotTypes.js';

const ACTION_ICONS: Record<string, LucideIcon> = {
  'plus-circle': PlusCircle,
  'git-branch': GitBranch,
};

function ActionBlock({ block }: { block: CopilotActionBlock }) {
  const Icon = ACTION_ICONS[block.icon] ?? PlusCircle;

  return (
    <div className="rounded-lg border border-border p-3 my-1.5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <span className="text-xs font-medium">{block.title}</span>
      </div>
      {block.description !== '' && <p className="mt-1 text-xs text-muted-foreground">{block.description}</p>}
    </div>
  );
}

function TextBlock({ block }: { block: CopilotTextBlock }) {
  return <p className="text-sm leading-relaxed whitespace-pre-wrap">{block.content}</p>;
}

function UserMessage({ message }: { message: CopilotMessage }) {
  const textBlock = message.blocks.find((b): b is CopilotTextBlock => b.type === 'text');

  return (
    <div className="flex justify-end">
      <div className="bg-muted text-foreground rounded-2xl px-4 py-2 max-w-[70%] text-sm leading-relaxed whitespace-pre-wrap">
        {textBlock?.content ?? ''}
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: CopilotMessage }) {
  return (
    <div className="flex flex-col gap-1 text-foreground">
      {message.blocks.map((block, i) => {
        if (block.type === 'action') return <ActionBlock key={i} block={block} />;
        return <TextBlock key={i} block={block} />;
      })}
    </div>
  );
}

export function MessageRow({ message }: { message: CopilotMessage }) {
  if (message.role === 'user') return <UserMessage message={message} />;
  return <AssistantMessage message={message} />;
}
