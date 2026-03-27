import type { ContentPart, MessageCard, RawMessage } from './messageTypes';

/* ─── Type guards ─── */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRawMessage(value: unknown): value is RawMessage {
  if (!isRecord(value)) return false;
  return typeof value.role === 'string';
}

function isContentPart(value: unknown): value is ContentPart {
  if (!isRecord(value)) return false;
  return typeof value.type === 'string';
}

/* ─── Content part to cards ─── */

function textPartToCard(role: string, text: string): MessageCard {
  if (role === 'user') return { kind: 'user', text };
  if (role === 'system') return { kind: 'system', text };
  return { kind: 'assistant', text };
}

function contentPartToCard(role: string, part: ContentPart): MessageCard | null {
  if (part.type === 'text') return textPartToCard(role, part.text);
  if (part.type === 'reasoning') return { kind: 'reasoning', text: part.text };
  if (part.type === 'tool-call') {
    return { kind: 'tool-call', toolName: part.toolName, args: part.args };
  }
  if (part.type === 'tool-result') {
    return { kind: 'tool-result', toolName: part.toolName, result: part.result ?? part.output };
  }
  return null;
}

/* ─── Single message to cards ─── */

function messageToCards(msg: RawMessage): MessageCard[] {
  if (typeof msg.content === 'string') {
    return [textPartToCard(msg.role, msg.content)];
  }
  if (!Array.isArray(msg.content)) return [];

  const cards: MessageCard[] = [];
  for (const part of msg.content) {
    if (!isContentPart(part)) continue;
    const card = contentPartToCard(msg.role, part);
    if (card !== null) cards.push(card);
  }
  return cards;
}

/* ─── Public API ─── */

export function parseMessages(data: unknown): MessageCard[] {
  if (!Array.isArray(data)) return [];

  const cards: MessageCard[] = [];
  for (const item of data) {
    if (isRawMessage(item)) {
      cards.push(...messageToCards(item));
    } else if (Array.isArray(item)) {
      for (const nested of item) {
        if (isRawMessage(nested)) {
          cards.push(...messageToCards(nested));
        }
      }
    }
  }
  return cards;
}
