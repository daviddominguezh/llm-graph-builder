'use client';

import { SmallJsonBlock, isJsonObject, tryParseJson } from '@/app/components/panels/JsonDisplay';
import '@/app/styles/starry-night.css';
import { Bot, Brackets, Brain, Cog, Lock, User, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MarkdownHooks } from 'react-markdown';
import rehypeStarryNight from 'rehype-starry-night';
import remarkGfm from 'remark-gfm';

import { parseMessages } from './messageParser';
import type { MessageCard } from './messageTypes';

/* ─── Role badge ─── */

function roleMeta(kind: MessageCard['kind'], t: (key: string) => string) {
  const map: Record<MessageCard['kind'], { label: string; icon: typeof User }> = {
    user: { label: t('roleUser'), icon: User },
    system: { label: t('roleSystem'), icon: Cog },
    assistant: { label: t('roleAssistant'), icon: Bot },
    reasoning: { label: t('roleReasoning'), icon: Brain },
    'tool-call': { label: t('roleToolCall'), icon: Wrench },
    'tool-result': { label: t('roleToolResult'), icon: Wrench },
    'tool-group': { label: t('roleToolCall'), icon: Wrench },
  };
  return map[kind];
}

function RoleBadge({ kind }: { kind: MessageCard['kind'] }) {
  const t = useTranslations('dashboard.debug');
  const meta = roleMeta(kind, t);
  const Icon = meta.icon;

  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium uppercase text-muted-foreground">
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

/* ─── Content renderers ─── */

function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="markdown-content text-xs leading-relaxed">
      <MarkdownHooks remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeStarryNight]}>
        {text}
      </MarkdownHooks>
    </div>
  );
}

function AssistantContent({ text }: { text: string }) {
  const parsed = tryParseJson(text);
  if (isJsonObject(parsed)) return <SmallJsonBlock value={parsed} />;
  return <MarkdownContent text={text} />;
}

function ToolJsonContent({ label, data }: { label: string; data: unknown }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase text-muted-foreground">{label}</span>
      {data === undefined ? (
        <span className="flex gap-1.5 items-center text-xs text-muted-foreground p-2 px-3 rounded-md bg-card italic">
          <Brackets className='size-3' />
          No args.
        </span>
      ) : isJsonObject(data) ? (
        <SmallJsonBlock value={data} className='bg-card!' />
      ) : (
        <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded bg-muted p-1.5 font-mono text-[10px]">
          {String(data ?? '')}
        </pre>
      )}
    </div>
  );
}

/* ─── Card renderer ─── */

function CardContent({ card }: { card: MessageCard }) {
  const t = useTranslations('dashboard.debug');

  if (card.kind === 'user') return <p className="whitespace-pre-wrap text-xs">{card.text}</p>;
  if (card.kind === 'system') return <MarkdownContent text={card.text} />;
  if (card.kind === 'assistant') return <AssistantContent text={card.text} />;
  if (card.kind === 'reasoning') {
    if (card.text === '[REDACTED]') {
      return (
        <p className="flex items-center gap-1.5 text-xs italic text-muted-foreground bg-input rounded-md p-3">
          <Lock className="size-3" />
          {t('encryptedByProvider')}
        </p>
      );
    }
    return <MarkdownContent text={card.text} />;
  }
  if (card.kind === 'tool-group') {
    return (
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] font-medium">{card.toolName}</span>
        <ToolJsonContent label={t('toolCallArgs')} data={card.args} />
        <div className="border-t" />
        <ToolJsonContent label={t('toolCallOutput')} data={card.result} />
      </div>
    );
  }
  if (card.kind === 'tool-call') {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] font-medium">{card.toolName}</span>
        <ToolJsonContent label={t('toolCallArgs')} data={card.args} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[11px] font-medium">{card.toolName}</span>
      <ToolJsonContent label={t('toolCallOutput')} data={card.result} />
    </div>
  );
}

/* ─── Public component ─── */

export function ResponseMessageCards({ data }: { data: unknown }) {
  const cards = parseMessages(data);
  if (cards.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {cards.map((card, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-md border border-transparent bg-card p-3">
          <RoleBadge kind={card.kind} />
          <CardContent card={card} />
        </div>
      ))}
    </div>
  );
}
