import type { McpTransport, VariableValue } from './types/index.js';

export const MCP_VARIABLE_PATTERN = /\{\{(?<name>\w+)\}\}/gv;

export interface EnvVarMaps {
  byName: Record<string, string>;
  byId: Record<string, string>;
}

function replaceInString(str: string, resolved: Record<string, string>): string {
  return str.replace(MCP_VARIABLE_PATTERN, (_match, name: string) => resolved[name] ?? `{{${name}}}`);
}

function replaceInRecord(
  record: Record<string, string> | undefined,
  resolved: Record<string, string>
): Record<string, string> | undefined {
  if (record === undefined) return undefined;
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, replaceInString(v, resolved)]));
}

function resolveStdio(
  transport: Extract<McpTransport, { type: 'stdio' }>,
  resolved: Record<string, string>
): McpTransport {
  return {
    ...transport,
    command: replaceInString(transport.command, resolved),
    args: transport.args?.map((a) => replaceInString(a, resolved)),
    env: replaceInRecord(transport.env, resolved),
  };
}

export function resolveTransport(transport: McpTransport, resolved: Record<string, string>): McpTransport {
  if (transport.type === 'stdio') return resolveStdio(transport, resolved);
  return {
    ...transport,
    url: replaceInString(transport.url, resolved),
    headers: replaceInRecord(transport.headers, resolved),
  };
}

export function extractTemplateVariables(transport: McpTransport): string[] {
  const json = JSON.stringify(transport);
  const names = new Set<string>();
  for (const match of json.matchAll(MCP_VARIABLE_PATTERN)) {
    const name = match.groups?.name;
    if (name !== undefined) names.add(name);
  }
  return [...names];
}

function resolveOneVar(value: VariableValue, env: EnvVarMaps): string {
  if (value.type === 'direct') return value.value;
  return env.byId[value.envVariableId] ?? '';
}

export function buildResolvedVars(
  variableValues: Record<string, VariableValue> | undefined,
  env: EnvVarMaps
): Record<string, string> {
  if (variableValues === undefined) return env.byName;
  const resolved: Record<string, string> = {};
  for (const [templateName, value] of Object.entries(variableValues)) {
    resolved[templateName] = resolveOneVar(value, env);
  }
  return resolved;
}
