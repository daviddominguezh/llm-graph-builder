/**
 * Tiny SSE (Server-Sent Events) frame parser. Operates over chunks of text
 * accumulated from a streamed HTTP response body.
 *
 * Per the SSE spec (https://html.spec.whatwg.org/multipage/server-sent-events.html):
 * - Events are separated by blank lines (\n\n).
 * - Each event is a sequence of lines like `field: value`.
 * - Multiple `data:` lines within an event are concatenated with `\n`.
 *
 * MCP only uses the `data` field — we ignore `event:`, `id:`, etc. for now.
 */

const DATA_FIELD = 'data';
const FIELD_SEPARATOR = ':';
const NOT_FOUND = -1;
const FIELD_VALUE_OFFSET = 1;
const SLICE_FROM_START = 0;

export interface SseEvent {
  data: string;
}

export interface ParsedChunk {
  events: SseEvent[];
  remaining: string;
}

function appendData(current: string | null, value: string): string {
  if (current === null) return value;
  return `${current}\n${value}`;
}

function parseField(line: string): { name: string; value: string } | null {
  const colon = line.indexOf(FIELD_SEPARATOR);
  if (colon === NOT_FOUND) return { name: line, value: '' };
  const name = line.slice(SLICE_FROM_START, colon);
  const rawValue = line.slice(colon + FIELD_VALUE_OFFSET);
  const value = rawValue.startsWith(' ') ? rawValue.slice(FIELD_VALUE_OFFSET) : rawValue;
  return { name, value };
}

function buildEventFromLines(lines: string[]): SseEvent | null {
  let data: string | null = null;
  for (const line of lines) {
    if (line === '') continue;
    if (line.startsWith(FIELD_SEPARATOR)) continue;
    const field = parseField(line);
    if (field === null) continue;
    if (field.name === DATA_FIELD) data = appendData(data, field.value);
  }
  if (data === null) return null;
  return { data };
}

/**
 * Split the buffer on blank-line boundaries (\n\n). Returns parsed events
 * for completed frames plus the trailing partial frame (if any) so the
 * caller can prepend it to the next chunk.
 */
export function parseSseChunk(buffer: string): ParsedChunk {
  const normalized = buffer.replace(/\r\n/gv, '\n').replace(/\r/gv, '\n');
  const frames = normalized.split('\n\n');
  const remaining = frames.pop() ?? '';
  const events: SseEvent[] = [];
  for (const frame of frames) {
    const event = buildEventFromLines(frame.split('\n'));
    if (event !== null) events.push(event);
  }
  return { events, remaining };
}
