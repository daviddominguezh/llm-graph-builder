import type { ExecutionMessageRow } from '@/app/lib/dashboard';

interface ContentBlock {
  type: string;
  text?: string;
}

function isContentBlockArray(val: unknown): val is ContentBlock[] {
  return (
    Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && 'type' in val[0]
  );
}

export function extractMessageText(msg: ExecutionMessageRow): string {
  if (typeof msg.content === 'string') return msg.content;

  if (isContentBlockArray(msg.content)) {
    const textBlock = msg.content.find((block) => block.type === 'text');
    if (textBlock !== undefined && typeof textBlock.text === 'string') {
      return textBlock.text;
    }
  }

  if (typeof msg.content === 'object' && msg.content !== null) {
    const rec = msg.content as Record<string, unknown>;
    if (typeof rec['text'] === 'string') return rec['text'];
  }

  return JSON.stringify(msg.content);
}
