'use client';

import { createExecutionKeyAction } from '@/app/actions/executionKeys';
import type { AgentMetadata } from '@/app/lib/agents';
import type { ExecutionKeyRow } from '@/app/lib/executionKeys';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from 'next-intl';
import { type FormEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface AgentOption {
  value: string;
  label: string;
}

interface CreateExecutionKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  agents: AgentMetadata[];
  onCreated: (result: { key: ExecutionKeyRow; fullKey: string }) => void;
}

interface FormErrors {
  nameError: string;
  agentsError: string;
}

function buildAgentOptions(agents: AgentMetadata[]): AgentOption[] {
  return agents.map((a) => ({ value: a.id, label: a.name }));
}

function validateForm(name: string, selectedIds: string[], t: (key: string) => string): FormErrors | null {
  const nameError = name === '' ? t('nameRequired') : '';
  const agentsError = selectedIds.length === 0 ? t('agentsRequired') : '';

  if (nameError !== '' || agentsError !== '') {
    return { nameError, agentsError };
  }

  return null;
}

function AgentChipsList({ selected }: { selected: AgentOption[] }) {
  return (
    <>
      {selected.map((item) => (
        <ComboboxChip key={item.value}>{item.label}</ComboboxChip>
      ))}
    </>
  );
}

function AgentMultiSelect({
  options,
  selected,
  onSelectedChange,
  error,
}: {
  options: AgentOption[];
  selected: AgentOption[];
  onSelectedChange: (values: AgentOption[]) => void;
  error: string;
}) {
  const t = useTranslations('executionKeys');
  const anchor = useComboboxAnchor();

  return (
    <div className="flex flex-col gap-1">
      <Label>{t('agents')}</Label>
      <p className="text-muted-foreground text-xs">{t('agentsDescription')}</p>
      <Combobox
        multiple
        items={options}
        value={selected}
        onValueChange={onSelectedChange}
        itemToStringLabel={(item) => item.label}
        isItemEqualToValue={(a, b) => a.value === b.value}
      >
        <ComboboxChips ref={anchor}>
          <AgentChipsList selected={selected} />
          <ComboboxChipsInput placeholder={t('agentsPlaceholder')} />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>{t('agentsPlaceholder')}</ComboboxEmpty>
          <ComboboxList>
            {(item: AgentOption) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error !== '' && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function NameField({ error }: { error: string }) {
  const t = useTranslations('executionKeys');

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="exec-key-name">{t('name')}</Label>
      <Input id="exec-key-name" name="name" placeholder={t('namePlaceholder')} required />
      {error !== '' && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function ExpirationField() {
  const t = useTranslations('executionKeys');

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="exec-key-expires">{t('expiresAt')}</Label>
      <p className="text-muted-foreground text-xs">{t('expiresAtDescription')}</p>
      <Input id="exec-key-expires" name="expiresAt" type="date" />
    </div>
  );
}

function useCreateKeyForm(
  orgId: string,
  selectedAgents: AgentOption[],
  onCreated: CreateExecutionKeyDialogProps['onCreated']
) {
  const t = useTranslations('executionKeys');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({ nameError: '', agentsError: '' });

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const expiresAt = (formData.get('expiresAt') as string) || null;
    const selectedIds = selectedAgents.map((a) => a.value);

    const validationErrors = validateForm(name, selectedIds, t);
    if (validationErrors !== null) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setErrors({ nameError: '', agentsError: '' });

    const { result, error } = await createExecutionKeyAction(orgId, name, selectedIds, expiresAt);
    setLoading(false);

    if (error !== null || result === null) {
      toast.error(error ?? t('createError'));
      return;
    }

    onCreated(result);
  }

  return { loading, errors, handleSubmit };
}

export function CreateExecutionKeyDialog({
  open,
  onOpenChange,
  orgId,
  agents,
  onCreated,
}: CreateExecutionKeyDialogProps) {
  const t = useTranslations('executionKeys');
  const options = useMemo(() => buildAgentOptions(agents), [agents]);
  const [selectedAgents, setSelectedAgents] = useState<AgentOption[]>([]);
  const { loading, errors, handleSubmit } = useCreateKeyForm(orgId, selectedAgents, onCreated);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('add')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <NameField error={errors.nameError} />
          <AgentMultiSelect
            options={options}
            selected={selectedAgents}
            onSelectedChange={setSelectedAgents}
            error={errors.agentsError}
          />
          <ExpirationField />
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {t('add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
