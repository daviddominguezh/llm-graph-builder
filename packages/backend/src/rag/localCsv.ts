import { parse as parseCsv } from 'csv-parse/sync';

import type { SourcedChunk } from './chunker.js';
import { LOCAL_CHUNK_SIZE_TOKENS, LOCAL_MIN_CHARS, buildLocalChunk, countTokens } from './localChunkUtils.js';

const ZERO = 0;
const ONE = 1;
const NO_HEADER = 0;
const NEWLINE = '\n';

function readCsv(buffer: Buffer): string[][] {
  const records = parseCsv(buffer, {
    columns: false,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as unknown;
  if (!Array.isArray(records)) return [];
  return records.filter((r): r is string[] => Array.isArray(r) && r.every((v) => typeof v === 'string'));
}

function escapeCell(value: string): string {
  const needsQuoting = value.includes(',') || value.includes('"') || value.includes(NEWLINE);
  const escaped = value.replace(/"/gv, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

function rowToCsvLine(row: readonly string[]): string {
  return row.map(escapeCell).join(',');
}

interface CsvAccumulator {
  rows: SourcedChunk[];
  buffer: string[];
  bufferTokens: number;
  paragraph: number;
  offset: number;
}

function flush(acc: CsvAccumulator, headerLine: string): CsvAccumulator {
  if (acc.buffer.length === ZERO) return acc;
  const body = acc.buffer.join(NEWLINE);
  const content = headerLine.length > NO_HEADER ? `${headerLine}\n${body}` : body;
  if (content.trim().length < LOCAL_MIN_CHARS) {
    return { ...acc, buffer: [], bufferTokens: ZERO };
  }
  const chunk = buildLocalChunk({ content, paragraph: acc.paragraph, offset: acc.offset });
  return {
    rows: [...acc.rows, chunk],
    buffer: [],
    bufferTokens: ZERO,
    paragraph: acc.paragraph + ONE,
    offset: acc.offset + content.length,
  };
}

interface RowAddCtx {
  headerLine: string;
  headerTokens: number;
}

function addRow(acc: CsvAccumulator, line: string, ctx: RowAddCtx): CsvAccumulator {
  const rowTokens = countTokens(line);
  const projected = acc.bufferTokens + rowTokens + ctx.headerTokens;
  const flushed =
    projected > LOCAL_CHUNK_SIZE_TOKENS && acc.buffer.length > ZERO ? flush(acc, ctx.headerLine) : acc;
  return {
    ...flushed,
    buffer: [...flushed.buffer, line],
    bufferTokens: flushed.bufferTokens + rowTokens,
  };
}

export function extractCsvChunks(buffer: Buffer): SourcedChunk[] {
  const rows = readCsv(buffer);
  if (rows.length === ZERO) return [];
  const [headerRow, ...dataRows] = rows;
  if (headerRow === undefined) return [];
  const ctx: RowAddCtx = {
    headerLine: rowToCsvLine(headerRow),
    headerTokens: countTokens(rowToCsvLine(headerRow)),
  };
  const initial: CsvAccumulator = {
    rows: [],
    buffer: [],
    bufferTokens: ZERO,
    paragraph: ZERO,
    offset: ZERO,
  };
  const accumulated = dataRows.reduce<CsvAccumulator>(
    (acc, row) => addRow(acc, rowToCsvLine(row), ctx),
    initial
  );
  const final = flush(accumulated, ctx.headerLine);
  return final.rows;
}
