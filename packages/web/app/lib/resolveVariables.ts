import type { McpTransport } from '@/app/schemas/graph.schema';

export interface DirectValue {
  type: 'direct';
  value: string;
}
export interface EnvRefValue {
  type: 'env_ref';
  envVariableId: string;
}
export type VariableValue = DirectValue | EnvRefValue;

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

export function extractVariableNames(transport: McpTransport): string[] {
  const json = JSON.stringify(transport);
  const names = new Set<string>();
  for (const match of json.matchAll(VARIABLE_PATTERN)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  return [...names];
}

export function replaceVariablesInString(str: string, resolved: Record<string, string>): string {
  return str.replace(VARIABLE_PATTERN, (_, name: string) => resolved[name] ?? `{{${name}}}`);
}

function replaceInHeaders(
  headers: Record<string, string> | undefined,
  resolved: Record<string, string>
): Record<string, string> | undefined {
  if (headers === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k, replaceVariablesInString(v, resolved)])
  );
}

export function replaceInTransport(transport: McpTransport, resolved: Record<string, string>): McpTransport {
  if (transport.type === 'stdio') {
    return {
      ...transport,
      command: replaceVariablesInString(transport.command, resolved),
      args: transport.args?.map((a) => replaceVariablesInString(a, resolved)),
      env: transport.env
        ? Object.fromEntries(
            Object.entries(transport.env).map(([k, v]) => [k, replaceVariablesInString(v, resolved)])
          )
        : undefined,
    };
  }
  return {
    ...transport,
    url: replaceVariablesInString(transport.url, resolved),
    headers: replaceInHeaders(transport.headers, resolved),
  };
}
