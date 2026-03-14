'use client';

import type { OrgEnvVariableRow } from '@/app/lib/org-env-variables';
import { extractVariableNames } from '@/app/lib/resolve-variables';
import type { McpServerConfig } from '@/app/schemas/graph.schema';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';

import { VariableValuesEditor } from './VariableValuesEditor';
import type { VariableValue } from './VariableValuesEditor';

interface LibraryServerFieldsProps {
  server: McpServerConfig;
  envVariables: OrgEnvVariableRow[];
  onUpdate: (updates: Partial<McpServerConfig>) => void;
}

export interface VariableValueShape {
  type: string;
  value?: string;
  envVariableId?: string;
}

export function areVariablesComplete(
  variableValues: Record<string, VariableValueShape> | undefined
): boolean {
  if (variableValues === undefined) return true;
  return Object.values(variableValues).every((v) =>
    v.type === 'direct' ? (v.value ?? '') !== '' : (v.envVariableId ?? '') !== ''
  );
}

function buildVariableList(server: McpServerConfig): Array<{ name: string }> {
  return extractVariableNames(server.transport).map((name) => ({ name }));
}

export function LibraryServerFields({ server, envVariables, onUpdate }: LibraryServerFieldsProps) {
  const t = useTranslations('mcpLibrary');
  const variables = buildVariableList(server);
  const values = (server.variableValues ?? {}) as Record<string, VariableValue>;

  function handleVariableChange(newValues: Record<string, VariableValue>): void {
    onUpdate({ variableValues: newValues as McpServerConfig['variableValues'] });
  }

  return (
    <div className="space-y-2 mt-2">
      <p className="text-xs text-muted-foreground">{t('readOnlyConfig')}</p>
      <div className="space-y-1">
        <Label>Name</Label>
        <Input value={server.name} disabled />
      </div>
      <div className="space-y-1">
        <Label>Transport</Label>
        <Input value={server.transport.type} disabled />
      </div>
      <VariableValuesEditor
        variables={variables}
        values={values}
        envVariables={envVariables}
        onChange={handleVariableChange}
      />
    </div>
  );
}
