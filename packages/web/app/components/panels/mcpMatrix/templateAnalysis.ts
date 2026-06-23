import type { McpTransport } from '@/app/schemas/graph.schema';
import { extractTemplateVariables } from '@daviddh/graph-types';

// Permissive scan for any `{{...}}` token so malformed placeholders surface.
const LOOSE_VARIABLE_PATTERN = /\{\{(?<inner>[^\{\}]*)\}\}/gv;
// A well-formed placeholder name (matches the canonical MCP_VARIABLE_PATTERN body).
const STRICT_NAME_PATTERN = /^\w+$/v;

export interface TemplateAnalysis {
  columns: string[];
  malformed: string[];
}

/**
 * Derives the auto-detected columns for a custom MCP server transport and reports
 * any malformed `{{ ... }}` tokens (e.g. with stray spaces) that would otherwise
 * silently produce no column.
 */
export function analyzeTemplate(transport: McpTransport): TemplateAnalysis {
  const columns = extractTemplateVariables(transport);
  const json = JSON.stringify(transport);
  const malformed: string[] = [];
  for (const match of json.matchAll(LOOSE_VARIABLE_PATTERN)) {
    const [token] = match;
    const inner = match.groups?.inner ?? '';
    if (!STRICT_NAME_PATTERN.test(inner) && !malformed.includes(token)) {
      malformed.push(token);
    }
  }
  return { columns, malformed };
}

export interface EndpointField {
  label: string;
  value: string;
}

export function transportEndpointFields(transport: McpTransport): EndpointField[] {
  if (transport.type === 'stdio') {
    return [
      { label: 'Command', value: transport.command },
      { label: 'Arguments', value: transport.args?.join(' ') ?? '' },
    ];
  }
  return [{ label: 'URL', value: transport.url }];
}

export function withUpdatedEndpoint(transport: McpTransport, label: string, value: string): McpTransport {
  if (transport.type === 'stdio') {
    if (label === 'Command') return { ...transport, command: value };
    return { ...transport, args: value.split(' ').filter(Boolean) };
  }
  return { ...transport, url: value };
}
