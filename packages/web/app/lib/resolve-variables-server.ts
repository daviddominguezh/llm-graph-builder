import type { McpTransport } from '@/app/schemas/graph.schema';

import { getEnvVariableValue } from './org-env-variables';
import type { VariableValue } from './resolve-variables';
import { replaceInTransport } from './resolve-variables';

export async function resolveValues(
  variableValues: Record<string, VariableValue>
): Promise<Record<string, string>> {
  const entries = Object.entries(variableValues);
  const resolved: Record<string, string> = {};

  await Promise.all(
    entries.map(async ([name, val]) => {
      if (val.type === 'direct') {
        resolved[name] = val.value;
      } else {
        const res = await getEnvVariableValue(val.envVariableId);
        resolved[name] = res.value ?? '';
      }
    })
  );

  return resolved;
}

export async function resolveTransportVariables(
  transport: McpTransport,
  variableValues: Record<string, VariableValue>
): Promise<McpTransport> {
  const resolved = await resolveValues(variableValues);
  return replaceInTransport(transport, resolved);
}
