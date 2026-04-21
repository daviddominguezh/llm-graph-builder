import type { PublicExecutionEvent } from '../types/publicEvents.js';

const DATA_PREFIX = 'data:';
const DATA_PREFIX_LEN: number = 'data:'.length;
const NEWLINE = '\n';
const NO_MATCH = -1;
const EMPTY_LEN = 0;
const NEXT_CHAR = 1;

function isEvent(value: unknown): value is PublicExecutionEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

function tryParseEvent(json: string): PublicExecutionEvent | undefined {
  try {
    const parsed: unknown = JSON.parse(json);
    return isEvent(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function extractDataJson(line: string): string | undefined {
  if (!line.startsWith(DATA_PREFIX)) return undefined;
  const json = line.slice(DATA_PREFIX_LEN).trim();
  return json.length > EMPTY_LEN ? json : undefined;
}

function parseLine(line: string): PublicExecutionEvent | undefined {
  const json = extractDataJson(line.trim());
  if (json === undefined) return undefined;
  return tryParseEvent(json);
}

function flushLines(buffer: string): { events: PublicExecutionEvent[]; rest: string } {
  const events: PublicExecutionEvent[] = [];
  let rest = buffer;
  let idx = rest.indexOf(NEWLINE);
  while (idx !== NO_MATCH) {
    const event = parseLine(rest.slice(EMPTY_LEN, idx));
    rest = rest.slice(idx + NEXT_CHAR);
    if (event !== undefined) events.push(event);
    idx = rest.indexOf(NEWLINE);
  }
  return { events, rest };
}

async function collectChunks(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array[]> {
  const { done, value } = await reader.read();
  if (done) return [];
  const rest = await collectChunks(reader);
  return [value, ...rest];
}

export async function* readSseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<PublicExecutionEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  const chunks = await collectChunks(body.getReader());

  for (const value of chunks) {
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = flushLines(buffer);
    buffer = rest;
    for (const event of events) yield event;
  }
}
