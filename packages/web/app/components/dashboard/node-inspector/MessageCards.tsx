'use client';

import { Bot, Brain, Cog, User, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { MarkdownHooks } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { SmallJsonBlock, isJsonObject, tryParseJson } from '@/app/components/panels/JsonDisplay';

import { parseMessages } from './messageParser';
import type { MessageCard } from './messageTypes';

/* ─── Role badge ─── */

interface RoleBadgeProps {
  kind: MessageCard['kind'];
}

function roleMeta(kind: MessageCard['kind'], t: (key: string) => string) {
  const map: Record<MessageCard['kind'], { label: string; icon: typeof User }> = {
    user: { label: t('roleUser'), icon: User },
    system: { label: t('roleSystem'), icon: Cog },
    assistant: { label: t('roleAssistant'), icon: Bot },
    reasoning: { label: t('roleReasoning'), icon: Brain },
    'tool-call': { label: t('roleToolCall'), icon: Wrench },
    'tool-result': { label: t('roleToolResult'), icon: Wrench },
  };
  return map[kind];
}

function RoleBadge({ kind }: RoleBadgeProps) {
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

function TextContent({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap text-xs">{text}</p>;
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="markdown-content text-xs leading-relaxed">
      <MarkdownHooks remarkPlugins={[remarkGfm]}>{text}</MarkdownHooks>
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
      {isJsonObject(data) ? (
        <SmallJsonBlock value={data} />
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

  if (card.kind === 'user') return <TextContent text={card.text} />;
  if (card.kind === 'system') return <MarkdownContent text={card.text} />;
  if (card.kind === 'assistant') return <AssistantContent text={card.text} />;
  if (card.kind === 'reasoning') return <MarkdownContent text={card.text} />;
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

function MessageCardItem({ card }: { card: MessageCard }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-card p-3">
      <RoleBadge kind={card.kind} />
      <CardContent card={card} />
    </div>
  );
}

/* ─── Public component ─── */

interface MessageCardsProps {
  data: unknown;
}

export function MessageCards({ data }: MessageCardsProps) {
  const t = useTranslations('dashboard.debug');
  const cards = parseMessages(data);

  if (cards.length === 0) return null;

  return (
    <details className="group" open>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        {t('messagesSent')}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {cards.map((card, i) => (
          <MessageCardItem key={i} card={card} />
        ))}
      </div>
    </details>
  );
}
