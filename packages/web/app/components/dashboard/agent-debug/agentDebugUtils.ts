import type { ExecutionMessageRow } from '@/app/lib/dashboard';

interface ContentBlock {
  type: string;
  text?: string;
}

const MIN_LENGTH = 0;

function isNonEmptyArray(val: unknown[]): boolean {
  return val.length > MIN_LENGTH;
}

function hasTypeProperty(item: unknown): boolean {
  return typeof item === 'object' && item !== null && 'type' in item;
}

function isContentBlockArray(val: unknown): val is ContentBlock[] {
  if (!Array.isArray(val)) return false;
  if (!isNonEmptyArray(val)) return false;
  return hasTypeProperty(val[MIN_LENGTH]);
}

function extractFromContentBlocks(blocks: ContentBlock[]): string | null {
  const textBlock = blocks.find((block) => block.type === 'text');
  if (textBlock !== undefined && typeof textBlock.text === 'string') {
    return textBlock.text;
  }
  return null;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function extractFromRecord(content: unknown): string | null {
  if (!isRecord(content)) return null;
  if (typeof content.text === 'string') return content.text;
  return null;
}

export function extractMessageText(msg: ExecutionMessageRow): string {
  if (typeof msg.content === 'string') return msg.content;

  if (isContentBlockArray(msg.content)) {
    const result = extractFromContentBlocks(msg.content);
    if (result !== null) return result;
  }

  const fromRecord = extractFromRecord(msg.content);
  if (fromRecord !== null) return fromRecord;

  return JSON.stringify(msg.content);
}
