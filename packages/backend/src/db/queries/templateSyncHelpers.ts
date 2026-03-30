import type { TemplateMcpServer } from '@daviddh/graph-types';

import type { McpTransportType } from './graphRowTypes.js';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface McpServerDbRow {
  server_id: string;
  name: string;
  transport_type: McpTransportType;
  transport_config: Record<string, unknown>;
  library_item_id: string | null;
}

interface ContextItemRow {
  content: string;
}

interface SkillSyncRow {
  name: string;
  description: string;
  content: string;
  repo_url: string;
  sort_order: number;
}

/* ------------------------------------------------------------------ */
/*  Type guards                                                        */
/* ------------------------------------------------------------------ */

export function isMcpServerDbRow(value: unknown): value is McpServerDbRow {
  return typeof value === 'object' && value !== null && 'server_id' in value && 'name' in value;
}

function isContextItemRow(value: unknown): value is ContextItemRow {
  return typeof value === 'object' && value !== null && 'content' in value;
}

function isSkillSyncRow(value: unknown): value is SkillSyncRow {
  return typeof value === 'object' && value !== null && 'name' in value && 'content' in value;
}

/* ------------------------------------------------------------------ */
/*  MCP row mapping                                                    */
/* ------------------------------------------------------------------ */

function extractHeaderKeysFromConfig(config: Record<string, unknown>): string[] {
  const { headers } = config;
  if (typeof headers === 'object' && headers !== null) return Object.keys(headers);
  return [];
}

function mapDbRowToTemplate(row: McpServerDbRow): TemplateMcpServer {
  if (row.library_item_id !== null) {
    return { type: 'library' as const, libraryItemId: row.library_item_id, name: row.name };
  }
  const url = typeof row.transport_config.url === 'string' ? row.transport_config.url : undefined;
  return {
    type: 'custom' as const,
    name: row.name,
    transportType: row.transport_type,
    url,
    headerKeys: extractHeaderKeysFromConfig(row.transport_config),
  };
}

export function stripMcpServerRowsToTemplate(rows: unknown): TemplateMcpServer[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(isMcpServerDbRow).map(mapDbRowToTemplate);
}

/* ------------------------------------------------------------------ */
/*  Context item & skill row mapping                                   */
/* ------------------------------------------------------------------ */

export function filterContextItems(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(isContextItemRow).map((r) => r.content);
}

export function mapSkillSyncRows(rows: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(rows)) return [];
  return rows.filter(isSkillSyncRow).map((r) => ({
    name: r.name,
    description: r.description,
    content: r.content,
    repoUrl: r.repo_url,
    sortOrder: r.sort_order,
  }));
}
