'use client';

import { getEnvVariableValueAction, getEnvVariablesByOrgAction } from '@/app/actions/orgEnvVariables';
import type { OrgEnvVariableRow } from '@/app/lib/orgEnvVariables';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { CreateEnvVariableDialog } from './CreateEnvVariableDialog';
import { DeleteEnvVariableDialog } from './DeleteEnvVariableDialog';
import { EditEnvVariableDialog } from './EditEnvVariableDialog';

interface EnvVariablesSectionProps {
  orgId: string;
  initialVariables: OrgEnvVariableRow[];
}

interface VariableRowProps {
  variable: OrgEnvVariableRow;
  onDeleteClick: (variable: OrgEnvVariableRow) => void;
  onEditClick: (variable: OrgEnvVariableRow) => void;
}

function RevealableValue({ variableId }: { variableId: string }) {
  const t = useTranslations('envVariables');
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState<string | null>(null);

  async function handleReveal() {
    if (revealed) {
      setRevealed(false);
      return;
    }
    const res = await getEnvVariableValueAction(variableId);
    if (res.error !== null) {
      toast.error(t('revealError'));
      return;
    }
    setValue(res.value);
    setRevealed(true);
  }

  const Icon = revealed ? EyeOff : Eye;

  return (
    <div className="flex flex-1 items-center gap-1.5">
      <Button variant="ghost" size="icon-sm" onClick={handleReveal}>
        <Icon className="size-3" />
      </Button>
      <span className="text-xs text-muted-foreground font-mono">
        {revealed && value !== null ? value : '••••••••'}
      </span>
    </div>
  );
}

function VariableRow({ variable, onDeleteClick, onEditClick }: VariableRowProps) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-card">
      <span className="w-[200px] shrink-0 truncate text-sm font-medium font-mono mr-6">{variable.name}</span>
      <RevealableValue variableId={variable.id} />
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={() => onEditClick(variable)}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="destructive" onClick={() => onDeleteClick(variable)}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

interface VariablesListProps {
  variables: OrgEnvVariableRow[];
  onDeleteClick: (variable: OrgEnvVariableRow) => void;
  onEditClick: (variable: OrgEnvVariableRow) => void;
}

function VariablesList({ variables, onDeleteClick, onEditClick }: VariablesListProps) {
  const t = useTranslations('envVariables');

  if (variables.length === 0) {
    return <p className="text-muted-foreground text-xs bg-muted py-2 px-3 rounded-md">{t('noVariables')}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {variables.map((variable) => (
        <VariableRow
          key={variable.id}
          variable={variable}
          onDeleteClick={onDeleteClick}
          onEditClick={onEditClick}
        />
      ))}
    </div>
  );
}

export function EnvVariablesSection({ orgId, initialVariables }: EnvVariablesSectionProps) {
  const t = useTranslations('envVariables');
  const [variables, setVariables] = useState<OrgEnvVariableRow[]>(initialVariables);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrgEnvVariableRow | null>(null);
  const [editTarget, setEditTarget] = useState<OrgEnvVariableRow | null>(null);

  const refreshVariables = useCallback(async () => {
    const { result } = await getEnvVariablesByOrgAction(orgId);
    setVariables(result);
  }, [orgId]);

  return (
    <Card className="bg-background ring-0">
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
        <VariablesList variables={variables} onDeleteClick={setDeleteTarget} onEditClick={setEditTarget} />
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
      {editTarget !== null && (
        <EditEnvVariableDialog
          open={editTarget !== null}
          onOpenChange={() => setEditTarget(null)}
          variable={editTarget}
          onSaved={refreshVariables}
        />
      )}
    </Card>
  );
}
