'use client';

import { getEnvVariablesByOrgAction } from '@/app/actions/org-env-variables';
import type { OrgEnvVariableRow } from '@/app/lib/org-env-variables';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { CreateEnvVariableDialog } from './CreateEnvVariableDialog';
import { DeleteEnvVariableDialog } from './DeleteEnvVariableDialog';

interface EnvVariablesSectionProps {
  orgId: string;
  initialVariables: OrgEnvVariableRow[];
}

interface VariableRowProps {
  variable: OrgEnvVariableRow;
  onDeleteClick: (variable: OrgEnvVariableRow) => void;
}

function VariableRow({ variable, onDeleteClick }: VariableRowProps) {
  const t = useTranslations('envVariables');

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium font-mono">{variable.name}</span>
        <Badge variant="outline" className="w-fit text-xs">
          {variable.is_secret ? t('secret') : t('visible')}
        </Badge>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={() => onDeleteClick(variable)}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

interface VariablesListProps {
  variables: OrgEnvVariableRow[];
  onDeleteClick: (variable: OrgEnvVariableRow) => void;
}

function VariablesList({ variables, onDeleteClick }: VariablesListProps) {
  const t = useTranslations('envVariables');

  if (variables.length === 0) {
    return (
      <p className="text-muted-foreground text-xs bg-gray-100 py-2 px-3 rounded-md">{t('noVariables')}</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {variables.map((variable) => (
        <VariableRow key={variable.id} variable={variable} onDeleteClick={onDeleteClick} />
      ))}
    </div>
  );
}

export function EnvVariablesSection({ orgId, initialVariables }: EnvVariablesSectionProps) {
  const t = useTranslations('envVariables');
  const [variables, setVariables] = useState<OrgEnvVariableRow[]>(initialVariables);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrgEnvVariableRow | null>(null);

  const refreshVariables = useCallback(async () => {
    const { result } = await getEnvVariablesByOrgAction(orgId);
    setVariables(result);
  }, [orgId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            {t('add')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <VariablesList variables={variables} onDeleteClick={setDeleteTarget} />
      </CardContent>
      <CreateEnvVariableDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        onCreated={refreshVariables}
      />
      {deleteTarget !== null && (
        <DeleteEnvVariableDialog
          open={deleteTarget !== null}
          onOpenChange={() => setDeleteTarget(null)}
          variableId={deleteTarget.id}
          variableName={deleteTarget.name}
          onDeleted={refreshVariables}
        />
      )}
    </Card>
  );
}
