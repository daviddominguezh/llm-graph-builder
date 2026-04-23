import type { PublicExecutionEvent } from '../types/publicEvents.js';

const DATA_PREFIX = 'data:';
const DATA_PREFIX_LEN: number = 'data:'.length;
const NEWLINE = '\n';
const NO_MATCH = -1;
const EMPTY_LEN = 0;
const NEXT_CHAR = 1;

function isEvent(value: unknown): value is PublicExecutionEvent {
  return (
    typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
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

function* drainBuffer(buffer: string): Generator<PublicExecutionEvent> {
  if (buffer.length === EMPTY_LEN) return;
  // Events without a trailing newline are still valid when the stream ends —
  // append one so flushLines parses the tail line.
  const { events } = flushLines(`${buffer}${NEWLINE}`);
  for (const event of events) yield event;
}

async function* readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
  buffer: string
): AsyncGenerator<PublicExecutionEvent> {
  const { done, value } = await reader.read();
  if (done) {
    yield* drainBuffer(buffer);
    return;
  }
  const next = buffer + decoder.decode(value, { stream: true });
  const { events, rest } = flushLines(next);
  for (const event of events) yield event;
  yield* readStream(reader, decoder, rest);
}

export async function* readSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<PublicExecutionEvent> {
  yield* readStream(body.getReader(), new TextDecoder(), '');
}
