import { MarkdownHooks } from 'react-markdown';
import rehypeStarryNight from 'rehype-starry-night';
import remarkGfm from 'remark-gfm';

import '@/app/styles/starry-night.css';

import { getMessageText } from '@/app/utils/message';
import { formatWhatsapp } from '@/app/utils/strs';
import type { ModelMessage } from 'ai';

interface MessageContentProps {
  message: ModelMessage;
  channel: string;
  isNote: boolean;
}

/**
 * Renders message text content.
 * - WhatsApp channel: uses WhatsApp-style formatting (bold, italic, strikethrough, etc.)
 * - All other channels: renders as Markdown with syntax highlighting
 */
export function MessageContent({ message, channel, isNote }: MessageContentProps) {
  const text = getMessageText(message) || '';
  if (!text) return null;

  const baseClass = isNote ? 'text-muted-foreground text-right text-xs!' : 'text-foreground';

  if (channel === 'whatsapp') {
    return (
      <div
        className={`px-2 py-1 break-words whitespace-pre-wrap text-[14px] leading-[1.5] ${baseClass}`}
        dangerouslySetInnerHTML={{ __html: formatWhatsapp(text) }}
      />
    );
  }

  return (
    <div className={`px-2 py-1 break-words text-[14px] leading-[1.5] ${baseClass}`}>
      <div className="markdown-content">
        <MarkdownHooks remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeStarryNight]}>
          {text}
        </MarkdownHooks>
      </div>
    </div>
  );
}
